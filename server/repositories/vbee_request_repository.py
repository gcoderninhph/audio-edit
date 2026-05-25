try:
    from services.auth_store import MYSQL_DATABASE, _connect
except ImportError:
    from ..services.auth_store import MYSQL_DATABASE, _connect


def create_vbee_voice_request_with_segments(request_payload, segment_payloads):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO vbee_voice_requests
                    (request_id, user_id, status, progress, queue_position, total_segments, completed_segments, failed_segments, character_count, language, voice_code, payload_json, result_urls_json, error_message, created_at, updated_at)
                VALUES (%s, %s, %s, %s, 0, %s, %s, %s, %s, %s, %s, %s, %s, '', %s, %s)
                """,
                (
                    request_payload['request_id'],
                    request_payload['user_id'],
                    request_payload['status'],
                    int(request_payload['progress']),
                    int(request_payload['total_segments']),
                    int(request_payload['completed_segments']),
                    int(request_payload['failed_segments']),
                    int(request_payload['character_count']),
                    request_payload['language'],
                    request_payload['voice_code'],
                    request_payload['payload_json'],
                    request_payload['result_urls_json'],
                    int(request_payload['created_at']),
                    int(request_payload['updated_at']),
                ),
            )
            for segment in segment_payloads:
                cursor.execute(
                    """
                    INSERT INTO vbee_voice_segments
                        (id, request_id, segment_index, text_content, start_ms, end_ms, language, voice_code, cache_key, token_id, provider_request_id, status, audio_url, error_message, character_count, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NULL, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        segment['id'],
                        segment['request_id'],
                        int(segment['segment_index']),
                        segment['text_content'],
                        int(segment['start_ms']),
                        int(segment['end_ms']),
                        segment['language'],
                        segment['voice_code'],
                        segment['cache_key'],
                        segment['provider_request_id'],
                        segment['status'],
                        segment['audio_url'],
                        segment['error_message'],
                        int(segment['character_count']),
                        int(segment['created_at']),
                        int(segment['updated_at']),
                    ),
                )
    finally:
        connection.close()


def list_vbee_request_status_counts(request_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT status, COUNT(*) AS count_value FROM vbee_voice_segments WHERE request_id = %s GROUP BY status',
                (request_id,),
            )
            return cursor.fetchall() or []
    finally:
        connection.close()


def get_vbee_request_segment_totals(request_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT COUNT(*) AS total_segments, COALESCE(SUM(character_count), 0) AS character_count FROM vbee_voice_segments WHERE request_id = %s',
                (request_id,),
            )
            return cursor.fetchone() or {}
    finally:
        connection.close()


def list_vbee_request_complete_audio_urls(request_id, complete_status):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT audio_url FROM vbee_voice_segments WHERE request_id = %s AND status = %s AND audio_url IS NOT NULL ORDER BY segment_index ASC',
                (request_id, complete_status),
            )
            return [row.get('audio_url') for row in cursor.fetchall() or [] if row.get('audio_url')]
    finally:
        connection.close()


def count_vbee_queue_position(request_id, queued_status):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT COUNT(*) AS queue_position FROM vbee_voice_requests WHERE status = %s AND created_at < (SELECT created_at FROM vbee_voice_requests WHERE request_id = %s)',
                (queued_status, request_id),
            )
            return int((cursor.fetchone() or {}).get('queue_position') or 0)
    finally:
        connection.close()


def update_vbee_voice_request_summary(
    request_id,
    status,
    progress,
    queue_position,
    total_segments,
    completed_segments,
    failed_segments,
    character_count,
    result_urls_json,
    updated_at,
):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'UPDATE vbee_voice_requests SET status = %s, progress = %s, queue_position = %s, total_segments = %s, completed_segments = %s, failed_segments = %s, character_count = %s, result_urls_json = %s, updated_at = %s WHERE request_id = %s',
                (
                    status,
                    int(progress),
                    int(queue_position),
                    int(total_segments),
                    int(completed_segments),
                    int(failed_segments),
                    int(character_count),
                    result_urls_json,
                    int(updated_at),
                    request_id,
                ),
            )
    finally:
        connection.close()


def list_vbee_segment_rows_for_request(request_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM vbee_voice_segments WHERE request_id = %s ORDER BY segment_index ASC', (request_id,))
            return cursor.fetchall() or []
    finally:
        connection.close()


def get_vbee_request_row(request_id, user_id=None):
    params = [request_id]
    user_clause = ''
    if user_id is not None:
        user_clause = ' AND user_id = %s'
        params.append(user_id)
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(f'SELECT * FROM vbee_voice_requests WHERE request_id = %s{user_clause} LIMIT 1', tuple(params))
            return cursor.fetchone()
    finally:
        connection.close()


def count_vbee_request_rows(status=''):
    where_clause = 'WHERE status = %s' if str(status or '').strip() else ''
    params = [str(status or '').strip().lower()] if where_clause else []
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(f'SELECT COUNT(*) AS total_items FROM vbee_voice_requests {where_clause}', tuple(params))
            return int((cursor.fetchone() or {}).get('total_items') or 0)
    finally:
        connection.close()


def list_vbee_request_rows(status='', limit=20, offset=0):
    where_clause = 'WHERE status = %s' if str(status or '').strip() else ''
    params = [str(status or '').strip().lower()] if where_clause else []
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f'SELECT * FROM vbee_voice_requests {where_clause} ORDER BY updated_at DESC, created_at DESC LIMIT %s OFFSET %s',
                tuple(params + [int(limit), int(offset)]),
            )
            return cursor.fetchall() or []
    finally:
        connection.close()


def list_vbee_segment_rows_by_status(status, limit=25, require_provider_request=False):
    provider_clause = ' AND provider_request_id IS NOT NULL' if require_provider_request else ''
    order_by = 'updated_at ASC, id ASC' if require_provider_request else 'created_at ASC, id ASC'
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f'SELECT * FROM vbee_voice_segments WHERE status = %s{provider_clause} ORDER BY {order_by} LIMIT %s',
                (status, int(limit)),
            )
            return cursor.fetchall() or []
    finally:
        connection.close()


def update_vbee_segment_row(segment_id, updates):
    assignments = ', '.join(f'{column} = %s' for column in updates)
    values = [updates[column] for column in updates]
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(f'UPDATE vbee_voice_segments SET {assignments} WHERE id = %s', (*values, str(segment_id)))
    finally:
        connection.close()


def get_vbee_segment_row(segment_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM vbee_voice_segments WHERE id = %s LIMIT 1', (str(segment_id),))
            return cursor.fetchone()
    finally:
        connection.close()


def update_vbee_request_row(request_id, updates):
    assignments = ', '.join(f'{column} = %s' for column in updates)
    values = [updates[column] for column in updates]
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(f'UPDATE vbee_voice_requests SET {assignments} WHERE request_id = %s', (*values, request_id))
    finally:
        connection.close()


def list_vbee_request_ids_for_cache_key(cache_key):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT DISTINCT request_id FROM vbee_voice_segments WHERE cache_key = %s', (cache_key,))
            return [row.get('request_id') or '' for row in cursor.fetchall() or [] if row.get('request_id')]
    finally:
        connection.close()


def count_vbee_segments_for_cache_key(cache_key):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) AS total_items FROM vbee_voice_segments WHERE cache_key = %s', (cache_key,))
            return int((cursor.fetchone() or {}).get('total_items') or 0)
    finally:
        connection.close()


def delete_vbee_segments_for_cache_key(cache_key):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM vbee_voice_segments WHERE cache_key = %s', (cache_key,))
            return int(cursor.rowcount or 0)
    finally:
        connection.close()


def count_vbee_segments_for_request(request_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) AS total_items FROM vbee_voice_segments WHERE request_id = %s', (request_id,))
            return int((cursor.fetchone() or {}).get('total_items') or 0)
    finally:
        connection.close()


def delete_vbee_request_row(request_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM vbee_voice_requests WHERE request_id = %s', (request_id,))
            return int(cursor.rowcount or 0)
    finally:
        connection.close()


def count_vbee_request_table_rows():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) AS total_items FROM vbee_voice_requests')
            return int((cursor.fetchone() or {}).get('total_items') or 0)
    finally:
        connection.close()


def count_vbee_segment_table_rows():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) AS total_items FROM vbee_voice_segments')
            return int((cursor.fetchone() or {}).get('total_items') or 0)
    finally:
        connection.close()


def count_vbee_audio_cache_table_rows():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) AS total_items FROM vbee_audio_cache')
            return int((cursor.fetchone() or {}).get('total_items') or 0)
    finally:
        connection.close()


def clear_all_vbee_request_data_rows():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM vbee_voice_segments')
            cursor.execute('DELETE FROM vbee_voice_requests')
            cursor.execute('DELETE FROM vbee_audio_cache')
    finally:
        connection.close()


def get_vbee_segment_row_by_provider_request(provider_request_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM vbee_voice_segments WHERE provider_request_id = %s LIMIT 1', (provider_request_id,))
            return cursor.fetchone()
    finally:
        connection.close()