try:
    from services.auth_store import MYSQL_DATABASE, _connect, _ensure_column
except ImportError:
    from ..services.auth_store import MYSQL_DATABASE, _connect, _ensure_column


def ensure_iap_package_table():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS iap_packages (
                    id VARCHAR(80) NOT NULL PRIMARY KEY,
                    name VARCHAR(120) NOT NULL,
                    pack_type VARCHAR(64) NOT NULL DEFAULT 'addCredit',
                    price DECIMAL(12, 2) NOT NULL,
                    currency VARCHAR(3) NOT NULL DEFAULT 'VND',
                    credits INT NOT NULL DEFAULT 0,
                    description TEXT NOT NULL,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    is_recommended TINYINT(1) NOT NULL DEFAULT 0,
                    created_at BIGINT NOT NULL,
                    updated_at BIGINT NOT NULL,
                    INDEX idx_iap_packages_active (is_active),
                    INDEX idx_iap_packages_updated (updated_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            _ensure_column(cursor, 'iap_packages', 'pack_type', "VARCHAR(64) NOT NULL DEFAULT 'addCredit' AFTER name")
            _ensure_column(cursor, 'iap_packages', 'is_recommended', "TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active")
    finally:
        connection.close()


def list_iap_package_rows(include_inactive=False):
    where_clause = '' if include_inactive else ' WHERE is_active = 1'
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f'SELECT * FROM iap_packages{where_clause} ORDER BY is_active DESC, is_recommended DESC, updated_at DESC, created_at DESC'
            )
            return cursor.fetchall() or []
    finally:
        connection.close()


def get_iap_package_row(package_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM iap_packages WHERE id = %s LIMIT 1', (package_id,))
            return cursor.fetchone()
    finally:
        connection.close()


def insert_iap_package_row(package_payload, created_at):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO iap_packages
                    (id, name, pack_type, price, currency, credits, description, is_active, is_recommended, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    package_payload['id'],
                    package_payload['name'],
                    package_payload['pack_type'],
                    str(package_payload['price']),
                    package_payload['currency'],
                    package_payload['credits'],
                    package_payload['description'],
                    package_payload['is_active'],
                    package_payload['is_recommended'],
                    int(created_at),
                    int(created_at),
                ),
            )
    finally:
        connection.close()


def update_iap_package_row(package_id, updates):
    assignments = ', '.join(f'{column} = %s' for column in updates)
    values = [updates[column] for column in updates]
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(f'UPDATE iap_packages SET {assignments} WHERE id = %s', (*values, package_id))
    finally:
        connection.close()


def delete_iap_package_row(package_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM iap_packages WHERE id = %s', (package_id,))
    finally:
        connection.close()