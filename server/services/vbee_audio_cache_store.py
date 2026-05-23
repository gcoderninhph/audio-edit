try:
    from services.auth_store import AuthStoreError, _require_driver
    from repositories.vbee_audio_cache_repository import (
        clear_vbee_segment_audio_urls_by_cache_key,
        delete_vbee_audio_cache_row,
        get_latest_completed_vbee_segment_row_for_reuse,
        get_vbee_audio_cache_row,
        list_expired_vbee_audio_cache_rows,
        list_vbee_request_ids_for_cache_key,
        update_vbee_audio_cache_expiry,
        upsert_vbee_audio_cache_row,
    )
    from utils.vbee_schema import VBEE_STATUS_COMPLETE, ensure_vbee_schema, now_timestamp, row_to_segment
except ImportError:
    from .auth_store import AuthStoreError, _require_driver
    from ..repositories.vbee_audio_cache_repository import (
        clear_vbee_segment_audio_urls_by_cache_key,
        delete_vbee_audio_cache_row,
        get_latest_completed_vbee_segment_row_for_reuse,
        get_vbee_audio_cache_row,
        list_expired_vbee_audio_cache_rows,
        list_vbee_request_ids_for_cache_key,
        update_vbee_audio_cache_expiry,
        upsert_vbee_audio_cache_row,
    )
    from ..utils.vbee_schema import VBEE_STATUS_COMPLETE, ensure_vbee_schema, now_timestamp, row_to_segment


def get_latest_completed_vbee_segment_for_reuse(cache_key):
    ensure_vbee_schema()
    safe_cache_key = str(cache_key or '').strip()
    if not safe_cache_key:
        return None
    driver = _require_driver()
    try:
        return row_to_segment(get_latest_completed_vbee_segment_row_for_reuse(safe_cache_key, VBEE_STATUS_COMPLETE))
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to load reusable Vbee segment') from error


def get_vbee_audio_cache(cache_key):
    ensure_vbee_schema()
    driver = _require_driver()
    try:
        row = get_vbee_audio_cache_row(cache_key)
        return {
            'cacheKey': row.get('cache_key') or '',
            'audioUrl': row.get('audio_url') or '',
            'fileName': row.get('file_name') or '',
            'providerRequestId': row.get('provider_request_id') or '',
            'characterCount': int(row.get('character_count') or 0),
            'expiresAt': int(row.get('expires_at') or 0),
            'updatedAt': int(row.get('updated_at') or 0),
        } if row else None
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to read Vbee audio cache') from error


def save_vbee_audio_cache(cache_key, language, voice_code, audio_url, provider_request_id='', character_count=0, file_name='', expires_at=0):
    ensure_vbee_schema()
    now = now_timestamp()
    driver = _require_driver()
    try:
        upsert_vbee_audio_cache_row(
            {
                'cache_key': cache_key,
                'language': language,
                'voice_code': voice_code,
                'text_hash': cache_key[-64:],
                'audio_url': audio_url,
                'file_name': file_name,
                'provider_request_id': provider_request_id,
                'character_count': int(character_count or 0),
                'expires_at': int(expires_at or 0),
                'created_at': now,
                'updated_at': now,
            }
        )
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to save Vbee audio cache') from error


def touch_vbee_audio_cache_expiry(cache_key, expires_at):
    ensure_vbee_schema()
    safe_cache_key = str(cache_key or '').strip()
    if not safe_cache_key:
        return None
    now = now_timestamp()
    driver = _require_driver()
    try:
        update_vbee_audio_cache_expiry(safe_cache_key, int(expires_at or 0), now)
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to refresh Vbee audio cache expiry') from error
    return get_vbee_audio_cache(safe_cache_key)


def list_expired_vbee_audio_cache(limit=100):
    ensure_vbee_schema()
    safe_limit = max(1, min(500, int(limit or 100)))
    now = now_timestamp()
    driver = _require_driver()
    try:
        rows = list_expired_vbee_audio_cache_rows(now, safe_limit)
        return [{
            'cacheKey': row.get('cache_key') or '',
            'audioUrl': row.get('audio_url') or '',
            'fileName': row.get('file_name') or '',
            'providerRequestId': row.get('provider_request_id') or '',
            'characterCount': int(row.get('character_count') or 0),
            'expiresAt': int(row.get('expires_at') or 0),
            'updatedAt': int(row.get('updated_at') or 0),
        } for row in rows]
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list expired Vbee audio cache') from error


def delete_vbee_audio_cache(cache_key):
    ensure_vbee_schema()
    safe_cache_key = str(cache_key or '').strip()
    if not safe_cache_key:
        return False
    driver = _require_driver()
    try:
        return delete_vbee_audio_cache_row(safe_cache_key) > 0
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to delete Vbee audio cache') from error


def clear_vbee_segment_audio_urls(cache_key, audio_url=''):
    ensure_vbee_schema()
    safe_cache_key = str(cache_key or '').strip()
    if not safe_cache_key:
        return []
    driver = _require_driver()
    try:
        request_ids = list_vbee_request_ids_for_cache_key(safe_cache_key, audio_url=audio_url)
        clear_vbee_segment_audio_urls_by_cache_key(
            safe_cache_key,
            now_timestamp(),
            audio_url=audio_url,
        )
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to clear Vbee segment audio URLs') from error
    try:
        from services.vbee_request_store import refresh_vbee_request_summary
    except ImportError:
        from .vbee_request_store import refresh_vbee_request_summary
    for request_id in request_ids:
        refresh_vbee_request_summary(request_id)
    return request_ids