try:
    from services.auth_store import MYSQL_DATABASE, _connect
except ImportError:
    from ..services.auth_store import MYSQL_DATABASE, _connect


def list_vbee_token_rows():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM vbee_tokens ORDER BY is_active DESC, updated_at DESC, id DESC')
            return cursor.fetchall() or []
    finally:
        connection.close()


def get_vbee_token_row(token_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM vbee_tokens WHERE id = %s LIMIT 1', (int(token_id),))
            return cursor.fetchone()
    finally:
        connection.close()


def list_vbee_token_processing_rows(token_id, processing_status):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT request_id, segment_index, character_count, provider_request_id FROM vbee_voice_segments WHERE token_id = %s AND status = %s ORDER BY updated_at DESC LIMIT 20',
                (int(token_id), processing_status),
            )
            return cursor.fetchall() or []
    finally:
        connection.close()


def count_vbee_token_completed_stats(token_id, complete_status):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT COUNT(DISTINCT request_id) AS count_value, COALESCE(SUM(character_count), 0) AS char_count FROM vbee_voice_segments WHERE token_id = %s AND status = %s',
                (int(token_id), complete_status),
            )
            return cursor.fetchone() or {}
    finally:
        connection.close()


def insert_vbee_token_row(name, client_id, token_secret, max_concurrent_requests, is_active, created_at):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'INSERT INTO vbee_tokens (name, client_id, token_secret, max_concurrent_requests, is_active, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s, %s)',
                (name, client_id, token_secret, int(max_concurrent_requests), int(is_active), int(created_at), int(created_at)),
            )
            return int(cursor.lastrowid)
    finally:
        connection.close()


def update_vbee_token_row(token_id, name, client_id, token_secret, max_concurrent_requests, is_active, updated_at):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'UPDATE vbee_tokens SET name = %s, client_id = %s, token_secret = %s, max_concurrent_requests = %s, is_active = %s, updated_at = %s WHERE id = %s',
                (name, client_id, token_secret, int(max_concurrent_requests), int(is_active), int(updated_at), int(token_id)),
            )
    finally:
        connection.close()


def delete_vbee_token_row(token_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM vbee_tokens WHERE id = %s', (int(token_id),))
    finally:
        connection.close()


def list_vbee_config_rows():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT config_key, config_value FROM vbee_configs')
            return cursor.fetchall() or []
    finally:
        connection.close()


def upsert_vbee_config_row(config_key, config_value, updated_at):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'INSERT INTO vbee_configs (config_key, config_value, updated_at) VALUES (%s, %s, %s) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_at = VALUES(updated_at)',
                (config_key, config_value, int(updated_at)),
            )
    finally:
        connection.close()


def list_active_vbee_token_rows_with_processing_count(processing_status):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT t.*, COUNT(s.id) AS processing_count
                FROM vbee_tokens t
                LEFT JOIN vbee_voice_segments s ON s.token_id = t.id AND s.status = %s
                WHERE t.is_active = 1
                GROUP BY t.id
                ORDER BY processing_count ASC, t.updated_at DESC, t.id ASC
                """,
                (processing_status,),
            )
            return cursor.fetchall() or []
    finally:
        connection.close()