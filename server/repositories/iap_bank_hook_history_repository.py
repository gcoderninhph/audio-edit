try:
    from services.auth_store import MYSQL_DATABASE, _connect
except ImportError:
    from ..services.auth_store import MYSQL_DATABASE, _connect


def ensure_iap_bank_hook_history_table():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS iap_bank_hook_history (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    api_key_id BIGINT NOT NULL,
                    api_key_name VARCHAR(120) NOT NULL,
                    gateway VARCHAR(120) NOT NULL DEFAULT '',
                    transaction_at BIGINT NOT NULL DEFAULT 0,
                    transaction_date_text VARCHAR(64) NOT NULL DEFAULT '',
                    account_number VARCHAR(80) NOT NULL DEFAULT '',
                    sub_account VARCHAR(80) NOT NULL DEFAULT '',
                    code VARCHAR(120) NOT NULL DEFAULT '',
                    content TEXT NULL,
                    transfer_type VARCHAR(32) NOT NULL DEFAULT '',
                    description TEXT NULL,
                    transfer_amount BIGINT NOT NULL DEFAULT 0,
                    accumulated BIGINT NOT NULL DEFAULT 0,
                    reference_code VARCHAR(160) NOT NULL DEFAULT '',
                    payload_json LONGTEXT NULL,
                    created_at BIGINT NOT NULL,
                    INDEX idx_iap_bank_hook_history_created (created_at),
                    INDEX idx_iap_bank_hook_history_api_key_created (api_key_id, created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
    finally:
        connection.close()


def get_iap_bank_hook_history_row(history_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM iap_bank_hook_history WHERE id = %s LIMIT 1', (int(history_id),))
            return cursor.fetchone()
    finally:
        connection.close()


def insert_iap_bank_hook_history_row(history_payload):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO iap_bank_hook_history (
                    api_key_id,
                    api_key_name,
                    gateway,
                    transaction_at,
                    transaction_date_text,
                    account_number,
                    sub_account,
                    code,
                    content,
                    transfer_type,
                    description,
                    transfer_amount,
                    accumulated,
                    reference_code,
                    payload_json,
                    created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    int(history_payload['api_key_id']),
                    history_payload['api_key_name'],
                    history_payload['gateway'],
                    int(history_payload['transaction_at']),
                    history_payload['transaction_date_text'],
                    history_payload['account_number'],
                    history_payload['sub_account'],
                    history_payload['code'],
                    history_payload['content'],
                    history_payload['transfer_type'],
                    history_payload['description'],
                    int(history_payload['transfer_amount']),
                    int(history_payload['accumulated']),
                    history_payload['reference_code'],
                    history_payload['payload_json'],
                    int(history_payload['created_at']),
                ),
            )
            return int(cursor.lastrowid)
    finally:
        connection.close()


def count_iap_bank_hook_history_rows(where_clause, where_params):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(f'SELECT COUNT(*) AS total_items FROM iap_bank_hook_history{where_clause}', where_params)
            return int((cursor.fetchone() or {}).get('total_items') or 0)
    finally:
        connection.close()


def list_iap_bank_hook_history_rows(where_clause, where_params, limit, offset):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT *
                FROM iap_bank_hook_history{where_clause}
                ORDER BY created_at DESC, id DESC
                LIMIT %s OFFSET %s
                """,
                (*where_params, int(limit), int(offset)),
            )
            return cursor.fetchall() or []
    finally:
        connection.close()