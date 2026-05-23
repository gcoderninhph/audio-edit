try:
    from services.auth_store import MYSQL_DATABASE, _connect
except ImportError:
    from ..services.auth_store import MYSQL_DATABASE, _connect


def ensure_iap_beneficiary_table():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS iap_beneficiary_accounts (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(120) NOT NULL,
                    bank_id VARCHAR(40) NOT NULL,
                    bank_account VARCHAR(80) NOT NULL,
                    is_current TINYINT(1) NOT NULL DEFAULT 0,
                    created_at BIGINT NOT NULL,
                    updated_at BIGINT NOT NULL,
                    INDEX idx_iap_beneficiary_current (is_current),
                    INDEX idx_iap_beneficiary_bank_account (bank_account)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
    finally:
        connection.close()


def list_iap_beneficiary_rows():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM iap_beneficiary_accounts ORDER BY is_current DESC, updated_at DESC, id DESC')
            return cursor.fetchall() or []
    finally:
        connection.close()


def get_iap_beneficiary_row(account_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM iap_beneficiary_accounts WHERE id = %s LIMIT 1', (int(account_id),))
            return cursor.fetchone()
    finally:
        connection.close()


def count_iap_beneficiary_accounts():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) AS total_accounts FROM iap_beneficiary_accounts')
            return int((cursor.fetchone() or {}).get('total_accounts') or 0)
    finally:
        connection.close()


def clear_iap_beneficiary_current(now):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('UPDATE iap_beneficiary_accounts SET is_current = 0, updated_at = %s', (int(now),))
    finally:
        connection.close()


def insert_iap_beneficiary_row(name, bank_id, bank_account, is_current, created_at):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO iap_beneficiary_accounts (name, bank_id, bank_account, is_current, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (name, bank_id, bank_account, 1 if is_current else 0, int(created_at), int(created_at)),
            )
            return cursor.lastrowid
    finally:
        connection.close()


def update_iap_beneficiary_row(account_id, name, bank_id, bank_account, is_current, updated_at):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'UPDATE iap_beneficiary_accounts SET name = %s, bank_id = %s, bank_account = %s, is_current = %s, updated_at = %s WHERE id = %s',
                (name, bank_id, bank_account, 1 if is_current else 0, int(updated_at), int(account_id)),
            )
    finally:
        connection.close()


def delete_iap_beneficiary_row(account_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM iap_beneficiary_accounts WHERE id = %s', (int(account_id),))
    finally:
        connection.close()


def get_latest_iap_beneficiary_id():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT id FROM iap_beneficiary_accounts ORDER BY updated_at DESC, id DESC LIMIT 1')
            row = cursor.fetchone()
            if not row:
                return None
            return int(row.get('id') or 0)
    finally:
        connection.close()


def set_iap_beneficiary_current(account_id, updated_at):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('UPDATE iap_beneficiary_accounts SET is_current = 1, updated_at = %s WHERE id = %s', (int(updated_at), int(account_id)))
    finally:
        connection.close()