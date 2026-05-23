try:
    from services.auth_store import MYSQL_DATABASE, _connect
except ImportError:
    from ..services.auth_store import MYSQL_DATABASE, _connect


def get_latest_completed_vbee_segment_row_for_reuse(cache_key, complete_status):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT * FROM vbee_voice_segments WHERE cache_key = %s AND status = %s AND token_id IS NOT NULL AND provider_request_id IS NOT NULL ORDER BY updated_at DESC, id DESC LIMIT 1',
                (cache_key, complete_status),
            )
            return cursor.fetchone()
    finally:
        connection.close()


def get_vbee_audio_cache_row(cache_key):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM vbee_audio_cache WHERE cache_key = %s LIMIT 1', (cache_key,))
            return cursor.fetchone()
    finally:
        connection.close()


def upsert_vbee_audio_cache_row(cache_payload):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'INSERT INTO vbee_audio_cache (cache_key, language, voice_code, text_hash, audio_url, file_name, provider_request_id, character_count, expires_at, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON DUPLICATE KEY UPDATE audio_url = VALUES(audio_url), file_name = VALUES(file_name), provider_request_id = VALUES(provider_request_id), character_count = VALUES(character_count), expires_at = VALUES(expires_at), updated_at = VALUES(updated_at)',
                (
                    cache_payload['cache_key'],
                    cache_payload['language'],
                    cache_payload['voice_code'],
                    cache_payload['text_hash'],
                    cache_payload['audio_url'],
                    cache_payload['file_name'],
                    cache_payload['provider_request_id'],
                    int(cache_payload['character_count']),
                    int(cache_payload['expires_at']),
                    int(cache_payload['created_at']),
                    int(cache_payload['updated_at']),
                ),
            )
    finally:
        connection.close()


def update_vbee_audio_cache_expiry(cache_key, expires_at, updated_at):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'UPDATE vbee_audio_cache SET expires_at = %s, updated_at = %s WHERE cache_key = %s',
                (int(expires_at), int(updated_at), cache_key),
            )
    finally:
        connection.close()


def list_expired_vbee_audio_cache_rows(now, limit):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT * FROM vbee_audio_cache WHERE expires_at > 0 AND expires_at <= %s ORDER BY expires_at ASC LIMIT %s',
                (int(now), int(limit)),
            )
            return cursor.fetchall() or []
    finally:
        connection.close()


def delete_vbee_audio_cache_row(cache_key):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM vbee_audio_cache WHERE cache_key = %s', (cache_key,))
            return int(cursor.rowcount or 0)
    finally:
        connection.close()


def list_vbee_request_ids_for_cache_key(cache_key, audio_url=''):
    params = [cache_key]
    audio_clause = ''
    if str(audio_url or '').strip():
        audio_clause = ' AND audio_url = %s'
        params.append(str(audio_url or '').strip())
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f'SELECT DISTINCT request_id FROM vbee_voice_segments WHERE cache_key = %s{audio_clause}',
                tuple(params),
            )
            return [row.get('request_id') or '' for row in cursor.fetchall() or [] if row.get('request_id')]
    finally:
        connection.close()


def clear_vbee_segment_audio_urls_by_cache_key(cache_key, updated_at, audio_url=''):
    params = [cache_key]
    audio_clause = ''
    if str(audio_url or '').strip():
        audio_clause = ' AND audio_url = %s'
        params.append(str(audio_url or '').strip())
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f'UPDATE vbee_voice_segments SET audio_url = NULL, updated_at = %s WHERE cache_key = %s{audio_clause}',
                tuple([int(updated_at), *params]),
            )
            return int(cursor.rowcount or 0)
    finally:
        connection.close()