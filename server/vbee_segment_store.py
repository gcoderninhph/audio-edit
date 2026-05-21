try:
    from auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _require_driver
    from vbee_schema import (
        VBEE_STATUS_COMPLETE,
        VBEE_STATUS_FAILED,
        VBEE_STATUS_PROCESSING,
        VBEE_STATUS_QUEUED,
        VbeeNotFoundError,
        ensure_vbee_schema,
        row_to_segment,
    )
except ImportError:
    from .auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _require_driver
    from .vbee_schema import (
        VBEE_STATUS_COMPLETE,
        VBEE_STATUS_FAILED,
        VBEE_STATUS_PROCESSING,
        VBEE_STATUS_QUEUED,
        VbeeNotFoundError,
        ensure_vbee_schema,
        row_to_segment,
    )


SUMMARY_SELECT = """
SELECT
    s.cache_key,
    MAX(s.text_content) AS text_content,
    MAX(s.language) AS language,
    MAX(s.voice_code) AS voice_code,
    COUNT(*) AS request_count,
    COALESCE(MAX(c.audio_url), MAX(s.audio_url)) AS audio_url,
    MAX(c.expires_at) AS expires_at,
    MAX(s.provider_request_id) AS provider_request_id,
    MAX(s.token_id) AS token_id,
    MAX(s.character_count) AS character_count,
    MAX(s.error_message) AS error_message,
    MAX(s.created_at) AS created_at,
    MAX(s.updated_at) AS updated_at,
    SUM(CASE WHEN s.status = %s THEN 1 ELSE 0 END) AS queued_count,
    SUM(CASE WHEN s.status = %s THEN 1 ELSE 0 END) AS processing_count,
    SUM(CASE WHEN s.status = %s THEN 1 ELSE 0 END) AS complete_count,
    SUM(CASE WHEN s.status = %s THEN 1 ELSE 0 END) AS failed_count
FROM vbee_voice_segments s
LEFT JOIN vbee_audio_cache c ON c.cache_key = s.cache_key
"""


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


def _summary_query_tail(where_clause=''):
    return f"{SUMMARY_SELECT}{where_clause} GROUP BY s.cache_key ORDER BY MAX(s.updated_at) DESC, MAX(s.created_at) DESC"


def _summary_query_params(*extra_params):
    return (VBEE_STATUS_QUEUED, VBEE_STATUS_PROCESSING, VBEE_STATUS_COMPLETE, VBEE_STATUS_FAILED, *extra_params)


def list_vbee_segment_summaries_page(status='', page=1, page_size=10):
    ensure_vbee_schema()
    normalized_status = str(status or '').strip().lower()
    safe_page = max(1, int(page or 1))
    safe_page_size = max(1, min(100, int(page_size or 20)))
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(_summary_query_tail(), _summary_query_params())
                segments = [_row_to_segment_summary(row) for row in cursor.fetchall() or []]
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list Vbee segments') from error

    if normalized_status:
        segments = [segment for segment in segments if segment['status'] == normalized_status]

    total_items = len(segments)
    total_pages = max(1, (total_items + safe_page_size - 1) // safe_page_size)
    current_page = min(safe_page, total_pages)
    start_index = (current_page - 1) * safe_page_size
    end_index = start_index + safe_page_size
    return {
        'segments': segments[start_index:end_index],
        'pagination': {
            'page': current_page,
            'pageSize': safe_page_size,
            'totalItems': total_items,
            'totalPages': total_pages,
            'hasNext': current_page < total_pages,
            'hasPrevious': current_page > 1,
        },
    }


def get_vbee_segment_detail(cache_key):
    ensure_vbee_schema()
    safe_cache_key = str(cache_key or '').strip()
    if not safe_cache_key:
        raise VbeeNotFoundError('Vbee segment not found')
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(_summary_query_tail('WHERE s.cache_key = %s'), _summary_query_params(safe_cache_key))
                summary_row = cursor.fetchone()
                if not summary_row:
                    raise VbeeNotFoundError('Vbee segment not found')
                cursor.execute('SELECT * FROM vbee_voice_segments WHERE cache_key = %s ORDER BY updated_at DESC, id DESC LIMIT 25', (safe_cache_key,))
                usages = [row_to_segment(row) for row in cursor.fetchall() or []]
        finally:
            connection.close()
    except VbeeNotFoundError:
        raise
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to load Vbee segment detail') from error

    return {
        **_row_to_segment_summary(summary_row),
        'usages': usages,
    }