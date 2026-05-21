try:
    from auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _require_driver
    from vbee_schema import VBEE_STATUS_COMPLETE, ensure_vbee_schema, now_timestamp, row_to_segment
except ImportError:
    from .auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _require_driver
    from .vbee_schema import VBEE_STATUS_COMPLETE, ensure_vbee_schema, now_timestamp, row_to_segment


def get_latest_completed_vbee_segment_for_reuse(cache_key):
    ensure_vbee_schema()
    safe_cache_key = str(cache_key or '').strip()
    if not safe_cache_key:
        return None
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    'SELECT * FROM vbee_voice_segments WHERE cache_key = %s AND status = %s AND token_id IS NOT NULL AND provider_request_id IS NOT NULL ORDER BY updated_at DESC, id DESC LIMIT 1',
                    (safe_cache_key, VBEE_STATUS_COMPLETE),
                )
                return row_to_segment(cursor.fetchone())
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to load reusable Vbee segment') from error


def get_vbee_audio_cache(cache_key):
    ensure_vbee_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM vbee_audio_cache WHERE cache_key = %s LIMIT 1', (cache_key,))
                row = cursor.fetchone()
                return {
                    'cacheKey': row.get('cache_key') or '',
                    'audioUrl': row.get('audio_url') or '',
                    'fileName': row.get('file_name') or '',
                    'providerRequestId': row.get('provider_request_id') or '',
                    'characterCount': int(row.get('character_count') or 0),
                    'expiresAt': int(row.get('expires_at') or 0),
                    'updatedAt': int(row.get('updated_at') or 0),
                } if row else None
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to read Vbee audio cache') from error


def save_vbee_audio_cache(cache_key, language, voice_code, audio_url, provider_request_id='', character_count=0, file_name='', expires_at=0):
    ensure_vbee_schema()
    now = now_timestamp()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    'INSERT INTO vbee_audio_cache (cache_key, language, voice_code, text_hash, audio_url, file_name, provider_request_id, character_count, expires_at, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON DUPLICATE KEY UPDATE audio_url = VALUES(audio_url), file_name = VALUES(file_name), provider_request_id = VALUES(provider_request_id), character_count = VALUES(character_count), expires_at = VALUES(expires_at), updated_at = VALUES(updated_at)',
                    (cache_key, language, voice_code, cache_key[-64:], audio_url, file_name, provider_request_id, int(character_count or 0), int(expires_at or 0), now, now),
                )
        finally:
            connection.close()
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
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    'UPDATE vbee_audio_cache SET expires_at = %s, updated_at = %s WHERE cache_key = %s',
                    (int(expires_at or 0), now, safe_cache_key),
                )
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to refresh Vbee audio cache expiry') from error
    return get_vbee_audio_cache(safe_cache_key)


def list_expired_vbee_audio_cache(limit=100):
    ensure_vbee_schema()
    safe_limit = max(1, min(500, int(limit or 100)))
    now = now_timestamp()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    'SELECT * FROM vbee_audio_cache WHERE expires_at > 0 AND expires_at <= %s ORDER BY expires_at ASC LIMIT %s',
                    (now, safe_limit),
                )
                return [{
                    'cacheKey': row.get('cache_key') or '',
                    'audioUrl': row.get('audio_url') or '',
                    'fileName': row.get('file_name') or '',
                    'providerRequestId': row.get('provider_request_id') or '',
                    'characterCount': int(row.get('character_count') or 0),
                    'expiresAt': int(row.get('expires_at') or 0),
                    'updatedAt': int(row.get('updated_at') or 0),
                } for row in cursor.fetchall() or []]
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list expired Vbee audio cache') from error


def delete_vbee_audio_cache(cache_key):
    ensure_vbee_schema()
    safe_cache_key = str(cache_key or '').strip()
    if not safe_cache_key:
        return False
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('DELETE FROM vbee_audio_cache WHERE cache_key = %s', (safe_cache_key,))
                return cursor.rowcount > 0
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to delete Vbee audio cache') from error


def clear_vbee_segment_audio_urls(cache_key, audio_url=''):
    ensure_vbee_schema()
    safe_cache_key = str(cache_key or '').strip()
    if not safe_cache_key:
        return []
    params = [safe_cache_key]
    audio_clause = ''
    if str(audio_url or '').strip():
        audio_clause = ' AND audio_url = %s'
        params.append(str(audio_url or '').strip())
    driver = _require_driver()
    request_ids = []
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(f'SELECT DISTINCT request_id FROM vbee_voice_segments WHERE cache_key = %s{audio_clause}', tuple(params))
                request_ids = [row.get('request_id') or '' for row in cursor.fetchall() or [] if row.get('request_id')]
                cursor.execute(
                    f'UPDATE vbee_voice_segments SET audio_url = NULL, updated_at = %s WHERE cache_key = %s{audio_clause}',
                    tuple([now_timestamp(), *params]),
                )
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to clear Vbee segment audio URLs') from error
    try:
        from vbee_request_store import refresh_vbee_request_summary
    except ImportError:
        from .vbee_request_store import refresh_vbee_request_summary
    for request_id in request_ids:
        refresh_vbee_request_summary(request_id)
    return request_ids