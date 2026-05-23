try:
    from services.auth_store import AuthStoreError, _require_driver
    from repositories.vbee_segment_repository import (
        get_vbee_segment_summary_row,
        list_vbee_segment_summary_rows,
        list_vbee_segment_usage_rows,
    )
    from utils.pagination import build_pagination, normalize_pagination
    from utils.vbee_schema import (
        VBEE_STATUS_COMPLETE,
        VBEE_STATUS_FAILED,
        VBEE_STATUS_PROCESSING,
        VBEE_STATUS_QUEUED,
        VbeeNotFoundError,
        ensure_vbee_schema,
        row_to_segment,
    )
except ImportError:
    from .auth_store import AuthStoreError, _require_driver
    from ..repositories.vbee_segment_repository import (
        get_vbee_segment_summary_row,
        list_vbee_segment_summary_rows,
        list_vbee_segment_usage_rows,
    )
    from ..utils.pagination import build_pagination, normalize_pagination
    from ..utils.vbee_schema import (
        VBEE_STATUS_COMPLETE,
        VBEE_STATUS_FAILED,
        VBEE_STATUS_PROCESSING,
        VBEE_STATUS_QUEUED,
        VbeeNotFoundError,
        ensure_vbee_schema,
        row_to_segment,
    )


def _segment_status_from_row(row):
    if int(row.get('processing_count') or 0) > 0:
        return VBEE_STATUS_PROCESSING
    if int(row.get('complete_count') or 0) > 0 or row.get('audio_url'):
        return VBEE_STATUS_COMPLETE
    if int(row.get('queued_count') or 0) > 0:
        return VBEE_STATUS_QUEUED
    if int(row.get('failed_count') or 0) > 0:
        return VBEE_STATUS_FAILED
    return VBEE_STATUS_QUEUED


def _row_to_segment_summary(row):
    request_count = int(row.get('request_count') or 0)
    return {
        'hash': row.get('cache_key') or '',
        'text': row.get('text_content') or '',
        'language': row.get('language') or '',
        'voiceCode': row.get('voice_code') or '',
        'requestCount': request_count,
        'reuseCount': max(0, request_count - 1),
        'status': _segment_status_from_row(row),
        'audioUrl': row.get('audio_url') or '',
        'expiresAt': int(row.get('expires_at') or 0),
        'providerRequestId': row.get('provider_request_id') or '',
        'tokenId': int(row.get('token_id') or 0) or None,
        'characterCount': int(row.get('character_count') or 0),
        'errorMessage': row.get('error_message') or '',
        'createdAt': int(row.get('created_at') or 0),
        'updatedAt': int(row.get('updated_at') or 0),
    }


def _failure_stage(usage):
    error_message = str(usage.get('errorMessage') or '').strip().lower()
    provider_request_id = usage.get('providerRequestId') or ''
    if 'voices' in error_message or 'voiceownership' in error_message or 'voice lookup' in error_message:
        return 'voice-lookup'
    if not provider_request_id:
        return 'submit'
    if usage.get('audioUrl'):
        return 'asset-store'
    return 'provider-processing'


def _failure_stage_label(stage):
    return {
        'voice-lookup': 'Voice lookup',
        'submit': 'Submit request',
        'provider-processing': 'Provider processing',
        'asset-store': 'Store audio asset',
    }.get(stage, 'Unknown')


def _build_failure_details(summary, usages):
    failed_usages = [usage for usage in usages if usage.get('status') == VBEE_STATUS_FAILED]
    if not failed_usages and not summary.get('errorMessage'):
        return None
    latest_failed_usage = failed_usages[0] if failed_usages else summary
    latest_stage = _failure_stage(latest_failed_usage)
    recent_failures = []
    seen_failure_keys = set()
    for usage in failed_usages:
        failure_key = (
            usage.get('requestId') or '',
            int(usage.get('index') or 0),
            int(usage.get('updatedAt') or usage.get('createdAt') or 0),
            usage.get('errorMessage') or '',
        )
        if failure_key in seen_failure_keys:
            continue
        seen_failure_keys.add(failure_key)
        stage = _failure_stage(usage)
        recent_failures.append({
            'requestId': usage.get('requestId') or '',
            'segmentIndex': int(usage.get('index') or 0),
            'providerRequestId': usage.get('providerRequestId') or '',
            'tokenId': usage.get('tokenId'),
            'language': usage.get('language') or summary.get('language') or '',
            'voiceCode': usage.get('voiceCode') or summary.get('voiceCode') or '',
            'updatedAt': int(usage.get('updatedAt') or usage.get('createdAt') or 0),
            'errorMessage': usage.get('errorMessage') or summary.get('errorMessage') or 'Vbee request failed',
            'stage': stage,
            'stageLabel': _failure_stage_label(stage),
        })
        if len(recent_failures) >= 5:
            break
    return {
        'summary': latest_failed_usage.get('errorMessage') or summary.get('errorMessage') or 'Vbee request failed',
        'stage': latest_stage,
        'stageLabel': _failure_stage_label(latest_stage),
        'failedUsageCount': len(failed_usages),
        'failedRequestCount': len({usage.get('requestId') or '' for usage in failed_usages if usage.get('requestId')}),
        'latestFailureAt': int(latest_failed_usage.get('updatedAt') or latest_failed_usage.get('createdAt') or summary.get('updatedAt') or 0),
        'latestRequestId': latest_failed_usage.get('requestId') or '',
        'latestProviderRequestId': latest_failed_usage.get('providerRequestId') or summary.get('providerRequestId') or '',
        'latestTokenId': latest_failed_usage.get('tokenId') or summary.get('tokenId'),
        'latestLanguage': latest_failed_usage.get('language') or summary.get('language') or '',
        'latestVoiceCode': latest_failed_usage.get('voiceCode') or summary.get('voiceCode') or '',
        'recentFailures': recent_failures,
    }


def list_vbee_segment_summaries_page(status='', page=1, page_size=10):
    ensure_vbee_schema()
    normalized_status = str(status or '').strip().lower()
    safe_page, safe_page_size = normalize_pagination(page, page_size, default_page_size=10, max_page_size=100)
    driver = _require_driver()
    try:
        segments = [_row_to_segment_summary(row) for row in list_vbee_segment_summary_rows(
            VBEE_STATUS_QUEUED,
            VBEE_STATUS_PROCESSING,
            VBEE_STATUS_COMPLETE,
            VBEE_STATUS_FAILED,
        )]
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list Vbee segments') from error

    if normalized_status:
        segments = [segment for segment in segments if segment['status'] == normalized_status]

    pagination = build_pagination(safe_page, safe_page_size, len(segments))
    current_page = pagination['page']
    start_index = (current_page - 1) * safe_page_size
    end_index = start_index + safe_page_size
    return {
        'segments': segments[start_index:end_index],
        'pagination': pagination,
    }


def get_vbee_segment_detail(cache_key):
    ensure_vbee_schema()
    safe_cache_key = str(cache_key or '').strip()
    if not safe_cache_key:
        raise VbeeNotFoundError('Vbee segment not found')
    driver = _require_driver()
    try:
        summary_row = get_vbee_segment_summary_row(
            safe_cache_key,
            VBEE_STATUS_QUEUED,
            VBEE_STATUS_PROCESSING,
            VBEE_STATUS_COMPLETE,
            VBEE_STATUS_FAILED,
        )
        if not summary_row:
            raise VbeeNotFoundError('Vbee segment not found')
        usages = [row_to_segment(row) for row in list_vbee_segment_usage_rows(safe_cache_key, limit=25)]
    except VbeeNotFoundError:
        raise
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to load Vbee segment detail') from error

    summary = _row_to_segment_summary(summary_row)
    return {
        **summary,
        'failureDetails': _build_failure_details(summary, usages),
        'usages': usages,
    }