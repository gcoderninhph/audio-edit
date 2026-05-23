import secrets

try:
    from utils.pagination import build_pagination, normalize_pagination
    from services.auth_store import AuthStoreError, _require_driver
    from repositories.vbee_request_repository import (
        clear_all_vbee_request_data_rows,
        count_vbee_audio_cache_table_rows,
        count_vbee_queue_position,
        count_vbee_request_rows,
        count_vbee_request_table_rows,
        count_vbee_segment_table_rows,
        count_vbee_segments_for_cache_key,
        count_vbee_segments_for_request,
        create_vbee_voice_request_with_segments,
        delete_vbee_request_row,
        delete_vbee_segments_for_cache_key,
        get_vbee_request_row,
        get_vbee_request_segment_totals,
        get_vbee_segment_row,
        get_vbee_segment_row_by_provider_request,
        list_vbee_request_complete_audio_urls,
        list_vbee_request_ids_for_cache_key,
        list_vbee_request_rows,
        list_vbee_request_status_counts,
        list_vbee_segment_rows_by_status,
        list_vbee_segment_rows_for_request,
        update_vbee_request_row,
        update_vbee_segment_row,
        update_vbee_voice_request_summary,
    )
    from utils.vbee_schema import (
        VBEE_STATUS_COMPLETE,
        VBEE_STATUS_FAILED,
        VBEE_STATUS_PROCESSING,
        VBEE_STATUS_QUEUED,
        VbeeNotFoundError,
        aggregate_status,
        ensure_vbee_schema,
        json_dumps,
        now_timestamp,
        row_to_request,
        row_to_segment,
    )
except ImportError:
    from ..utils.pagination import build_pagination, normalize_pagination
    from .auth_store import AuthStoreError, _require_driver
    from ..repositories.vbee_request_repository import (
        clear_all_vbee_request_data_rows,
        count_vbee_audio_cache_table_rows,
        count_vbee_queue_position,
        count_vbee_request_rows,
        count_vbee_request_table_rows,
        count_vbee_segment_table_rows,
        count_vbee_segments_for_cache_key,
        count_vbee_segments_for_request,
        create_vbee_voice_request_with_segments,
        delete_vbee_request_row,
        delete_vbee_segments_for_cache_key,
        get_vbee_request_row,
        get_vbee_request_segment_totals,
        get_vbee_segment_row,
        get_vbee_segment_row_by_provider_request,
        list_vbee_request_complete_audio_urls,
        list_vbee_request_ids_for_cache_key,
        list_vbee_request_rows,
        list_vbee_request_status_counts,
        list_vbee_segment_rows_by_status,
        list_vbee_segment_rows_for_request,
        update_vbee_request_row,
        update_vbee_segment_row,
        update_vbee_voice_request_summary,
    )
    from ..utils.vbee_schema import (
        VBEE_STATUS_COMPLETE,
        VBEE_STATUS_FAILED,
        VBEE_STATUS_PROCESSING,
        VBEE_STATUS_QUEUED,
        VbeeNotFoundError,
        aggregate_status,
        ensure_vbee_schema,
        json_dumps,
        now_timestamp,
        row_to_request,
        row_to_segment,
    )


def generate_request_id():
    return f'vbee-{now_timestamp()}-{secrets.token_hex(5)}'


def create_vbee_request_record(user_id, language, voice_code, payload, segments):
    ensure_vbee_schema()
    request_id = generate_request_id()
    now = now_timestamp()
    total_segments = len(segments)
    completed_segments = sum(1 for segment in segments if segment.get('status') == VBEE_STATUS_COMPLETE)
    failed_segments = sum(1 for segment in segments if segment.get('status') == VBEE_STATUS_FAILED)
    character_count = sum(int(segment.get('characterCount') or len(segment.get('text') or '')) for segment in segments)
    status = aggregate_status(total_segments, completed_segments, failed_segments, total_segments - completed_segments - failed_segments, 0)
    result_urls = [segment.get('audioUrl') for segment in segments if segment.get('audioUrl')]
    progress = int(round((completed_segments / total_segments) * 100)) if total_segments else 0

    request_payload = {
        'request_id': request_id,
        'user_id': user_id,
        'status': status,
        'progress': progress,
        'total_segments': total_segments,
        'completed_segments': completed_segments,
        'failed_segments': failed_segments,
        'character_count': character_count,
        'language': language,
        'voice_code': voice_code,
        'payload_json': json_dumps(payload),
        'result_urls_json': json_dumps(result_urls),
        'created_at': now,
        'updated_at': now,
    }
    segment_payloads = []
    for index, segment in enumerate(segments):
        segment_payloads.append(
            {
                'request_id': request_id,
                'segment_index': index,
                'text_content': segment['text'],
                'start_ms': int(segment.get('startMs') or 0),
                'end_ms': int(segment.get('endMs') or 0),
                'language': language,
                'voice_code': voice_code,
                'cache_key': segment['cacheKey'],
                'provider_request_id': segment.get('providerRequestId'),
                'status': segment.get('status') or VBEE_STATUS_QUEUED,
                'audio_url': segment.get('audioUrl') or None,
                'error_message': segment.get('errorMessage') or None,
                'character_count': int(segment.get('characterCount') or len(segment['text'])),
                'created_at': now,
                'updated_at': now,
            }
        )

    driver = _require_driver()
    try:
        create_vbee_voice_request_with_segments(request_payload, segment_payloads)
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to create Vbee request') from error
    return get_vbee_request(request_id)


def refresh_vbee_request_summary(request_id):
    ensure_vbee_schema()
    driver = _require_driver()
    try:
        counts = {
            row['status']: int(row.get('count_value') or 0)
            for row in list_vbee_request_status_counts(request_id)
        }
        totals_row = get_vbee_request_segment_totals(request_id)
        total = int(totals_row.get('total_segments') or 0)
        completed = counts.get(VBEE_STATUS_COMPLETE, 0)
        failed = counts.get(VBEE_STATUS_FAILED, 0)
        queued = counts.get(VBEE_STATUS_QUEUED, 0)
        processing = counts.get(VBEE_STATUS_PROCESSING, 0)
        character_count = int(totals_row.get('character_count') or 0)
        status = aggregate_status(total, completed, failed, queued, processing)
        progress = int(round((completed / total) * 100)) if total else 0
        result_urls = list_vbee_request_complete_audio_urls(request_id, VBEE_STATUS_COMPLETE)
        queue_position = count_vbee_queue_position(request_id, VBEE_STATUS_QUEUED) + 1 if status == VBEE_STATUS_QUEUED else 0
        update_vbee_voice_request_summary(
            request_id,
            status,
            progress,
            queue_position,
            total,
            completed,
            failed,
            character_count,
            json_dumps(result_urls),
            now_timestamp(),
        )
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to update Vbee request') from error
    return get_vbee_request(request_id)


def list_vbee_segments(request_id):
    ensure_vbee_schema()
    driver = _require_driver()
    try:
        return [row_to_segment(row) for row in list_vbee_segment_rows_for_request(request_id)]
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list Vbee segments') from error


def get_vbee_request(request_id, user_id=None):
    ensure_vbee_schema()
    driver = _require_driver()
    try:
        row = get_vbee_request_row(request_id, user_id=user_id)
        if not row:
            raise VbeeNotFoundError('Vbee request not found')
        return row_to_request(row, segments=list_vbee_segments(request_id))
    except VbeeNotFoundError:
        raise
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to load Vbee request') from error


def list_vbee_requests_page(status='', page=1, page_size=20):
    ensure_vbee_schema()
    safe_page, safe_page_size = normalize_pagination(page, page_size, default_page_size=20, max_page_size=100)
    normalized_status = str(status or '').strip().lower()
    driver = _require_driver()
    try:
        total_items = count_vbee_request_rows(normalized_status)
        pagination = build_pagination(safe_page, safe_page_size, total_items)
        current_page = pagination['page']
        rows = list_vbee_request_rows(
            normalized_status,
            limit=safe_page_size,
            offset=(current_page - 1) * safe_page_size,
        )
        return {
            'requests': [row_to_request(row) for row in rows],
            'pagination': pagination,
        }
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list Vbee requests') from error


def list_queued_vbee_segments(limit=25):
    ensure_vbee_schema()
    safe_limit = max(1, min(200, int(limit or 25)))
    driver = _require_driver()
    try:
        return [row_to_segment(row) for row in list_vbee_segment_rows_by_status(VBEE_STATUS_QUEUED, limit=safe_limit)]
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list queued Vbee segments') from error


def list_processing_vbee_segments(limit=50):
    ensure_vbee_schema()
    safe_limit = max(1, min(200, int(limit or 50)))
    driver = _require_driver()
    try:
        return [
            row_to_segment(row)
            for row in list_vbee_segment_rows_by_status(VBEE_STATUS_PROCESSING, limit=safe_limit, require_provider_request=True)
        ]
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list processing Vbee segments') from error


def mark_vbee_segment_processing(segment_id, token_id, provider_request_id, voice_code=None):
    return update_vbee_segment(segment_id, status=VBEE_STATUS_PROCESSING, token_id=token_id, provider_request_id=provider_request_id, voice_code=voice_code)


def update_vbee_segment(segment_id, status=None, token_id=None, provider_request_id=None, audio_url=None, error_message=None, language=None, voice_code=None):
    ensure_vbee_schema()
    driver = _require_driver()
    updates = {'updated_at': now_timestamp()}
    if status is not None:
        updates['status'] = status
    if token_id is not None:
        updates['token_id'] = token_id
    if provider_request_id is not None:
        updates['provider_request_id'] = provider_request_id
    if audio_url is not None:
        updates['audio_url'] = audio_url
    if error_message is not None:
        updates['error_message'] = error_message
    if language is not None:
        updates['language'] = language
    if voice_code is not None:
        updates['voice_code'] = voice_code
    try:
        update_vbee_segment_row(int(segment_id), updates)
        row = get_vbee_segment_row(int(segment_id))
        if row and (language is not None or voice_code is not None):
            request_updates = {'updated_at': now_timestamp()}
            if language is not None:
                request_updates['language'] = language
            if voice_code is not None:
                request_updates['voice_code'] = voice_code
            update_vbee_request_row(row['request_id'], request_updates)
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to update Vbee segment') from error
    return refresh_vbee_request_summary(row['request_id']) if row else None


def clear_vbee_request_data_for_cache_key(cache_key):
    ensure_vbee_schema()
    safe_cache_key = str(cache_key or '').strip()
    if not safe_cache_key:
        raise VbeeNotFoundError('Vbee segment not found')
    driver = _require_driver()
    request_ids = []
    refresh_request_ids = []
    deleted_request_count = 0
    segment_count = 0
    try:
        request_ids = list_vbee_request_ids_for_cache_key(safe_cache_key)
        segment_count = count_vbee_segments_for_cache_key(safe_cache_key)
        if segment_count <= 0:
            raise VbeeNotFoundError('Vbee segment not found')
        delete_vbee_segments_for_cache_key(safe_cache_key)
        for request_id in request_ids:
            remaining_segments = count_vbee_segments_for_request(request_id)
            if remaining_segments > 0:
                refresh_request_ids.append(request_id)
                continue
            deleted_request_count += delete_vbee_request_row(request_id)
    except VbeeNotFoundError:
        raise
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to clear Vbee segment request data') from error

    for request_id in refresh_request_ids:
        refresh_vbee_request_summary(request_id)

    return {
        'deletedRequestCount': deleted_request_count,
        'requestCount': len(request_ids),
        'requestIds': request_ids,
        'segmentCount': segment_count,
    }


def clear_all_vbee_request_data():
    ensure_vbee_schema()
    driver = _require_driver()
    try:
        request_count = count_vbee_request_table_rows()
        segment_count = count_vbee_segment_table_rows()
        asset_count = count_vbee_audio_cache_table_rows()
        clear_all_vbee_request_data_rows()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to clear Vbee request data') from error
    return {
        'assetCount': asset_count,
        'requestCount': request_count,
        'segmentCount': segment_count,
    }


def get_vbee_segment_by_provider_request(provider_request_id):
    ensure_vbee_schema()
    driver = _require_driver()
    try:
        segment = row_to_segment(get_vbee_segment_row_by_provider_request(provider_request_id))
        if not segment:
            raise VbeeNotFoundError('Vbee segment not found')
        return segment
    except VbeeNotFoundError:
        raise
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to load Vbee segment') from error
