try:
    from services.auth_store import MYSQL_DATABASE, _connect, _ensure_column
except ImportError:
    from ..services.auth_store import MYSQL_DATABASE, _connect, _ensure_column


def ensure_iap_api_key_table():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS iap_api_keys (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(120) NOT NULL,
                    api_key VARCHAR(160) NOT NULL UNIQUE,
                    hook_method VARCHAR(8) NOT NULL DEFAULT 'POST',
                    header_name VARCHAR(80) NOT NULL DEFAULT 'X-Api-Key',
                    header_format VARCHAR(200) NOT NULL DEFAULT '<API_KEY>',
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    last_used_at BIGINT NOT NULL DEFAULT 0,
                    created_at BIGINT NOT NULL,
                    updated_at BIGINT NOT NULL,
                    INDEX idx_iap_api_keys_active (is_active)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            _ensure_column(cursor, 'iap_api_keys', 'hook_method', "VARCHAR(8) NOT NULL DEFAULT 'POST' AFTER api_key")
            _ensure_column(cursor, 'iap_api_keys', 'header_name', "VARCHAR(80) NOT NULL DEFAULT 'X-Api-Key' AFTER hook_method")
            _ensure_column(cursor, 'iap_api_keys', 'header_format', "VARCHAR(200) NOT NULL DEFAULT '<API_KEY>' AFTER header_name")
            cursor.execute("ALTER TABLE iap_api_keys MODIFY COLUMN hook_method VARCHAR(8) NOT NULL DEFAULT 'POST'")
            cursor.execute("ALTER TABLE iap_api_keys MODIFY COLUMN header_name VARCHAR(80) NOT NULL DEFAULT 'X-Api-Key'")
            cursor.execute("ALTER TABLE iap_api_keys MODIFY COLUMN header_format VARCHAR(200) NOT NULL DEFAULT '<API_KEY>'")
    finally:
        connection.close()


def list_iap_api_key_rows():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM iap_api_keys ORDER BY is_active DESC, updated_at DESC')
            return cursor.fetchall() or []
    finally:
        connection.close()


def get_iap_api_key_row(key_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM iap_api_keys WHERE id = %s LIMIT 1', (int(key_id),))
            return cursor.fetchone()
    finally:
        connection.close()


def insert_iap_api_key_row(name, api_key, hook_method, header_name, header_format, is_active, created_at):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO iap_api_keys (name, api_key, hook_method, header_name, header_format, is_active, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (name, api_key, hook_method, header_name, header_format, int(is_active), int(created_at), int(created_at)),
            )
            return cursor.lastrowid
    finally:
        connection.close()


def delete_iap_api_key_row(key_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM iap_api_keys WHERE id = %s', (int(key_id),))
    finally:
        connection.close()


def list_active_iap_api_key_rows_by_method(method):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT * FROM iap_api_keys WHERE is_active = 1 AND hook_method = %s ORDER BY updated_at DESC',
                (method,),
            )
            return cursor.fetchall() or []
    finally:
        connection.close()


def touch_iap_api_key_last_used(key_id, used_at):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('UPDATE iap_api_keys SET last_used_at = %s WHERE id = %s', (int(used_at), int(key_id)))
    finally:
        connection.close()