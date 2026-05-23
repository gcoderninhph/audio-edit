try:
    from services.auth_store import MYSQL_DATABASE, _connect, _ensure_column
except ImportError:
    from ..services.auth_store import MYSQL_DATABASE, _connect, _ensure_column


def ensure_iap_admin_tables():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS iap_pack_functions (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    pack_iap_id VARCHAR(80) NOT NULL,
                    function_type VARCHAR(32) NOT NULL,
                    credits INT NOT NULL DEFAULT 0,
                    premium_mode VARCHAR(32) NOT NULL DEFAULT 'none',
                    premium_duration_days INT NOT NULL DEFAULT 0,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at BIGINT NOT NULL,
                    updated_at BIGINT NOT NULL,
                    INDEX idx_iap_pack_functions_pack (pack_iap_id),
                    INDEX idx_iap_pack_functions_active (is_active)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            _ensure_column(
                cursor,
                'iap_pack_functions',
                'premium_duration_days',
                'INT NOT NULL DEFAULT 0 AFTER premium_mode',
            )
            cursor.execute('ALTER TABLE iap_pack_functions MODIFY COLUMN premium_duration_days INT NOT NULL DEFAULT 0')
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS iap_sales (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(120) NOT NULL,
                    pack_id VARCHAR(80) NOT NULL,
                    discount_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
                    start_at BIGINT NOT NULL DEFAULT 0,
                    end_at BIGINT NOT NULL DEFAULT 0,
                    first_pack_purchase TINYINT(1) NOT NULL DEFAULT 0,
                    first_iap_purchase TINYINT(1) NOT NULL DEFAULT 0,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at BIGINT NOT NULL,
                    updated_at BIGINT NOT NULL,
                    INDEX idx_iap_sales_pack (pack_id),
                    INDEX idx_iap_sales_active (is_active)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
    finally:
        connection.close()


def list_iap_pack_function_rows():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM iap_pack_functions ORDER BY is_active DESC, updated_at DESC')
            return cursor.fetchall() or []
    finally:
        connection.close()


def insert_iap_pack_function_row(
    pack_iap_id,
    function_type,
    credits,
    premium_mode,
    premium_duration_days,
    is_active,
    created_at,
):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO iap_pack_functions
                    (pack_iap_id, function_type, credits, premium_mode, premium_duration_days, is_active, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    pack_iap_id,
                    function_type,
                    int(credits),
                    premium_mode,
                    int(premium_duration_days),
                    int(is_active),
                    int(created_at),
                    int(created_at),
                ),
            )
            return int(cursor.lastrowid)
    finally:
        connection.close()


def get_iap_pack_function_row(record_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM iap_pack_functions WHERE id = %s LIMIT 1', (int(record_id),))
            return cursor.fetchone()
    finally:
        connection.close()


def update_iap_pack_function_row(record_id, updates):
    assignments = ', '.join(f'{column} = %s' for column in updates)
    values = [updates[column] for column in updates]
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(f'UPDATE iap_pack_functions SET {assignments} WHERE id = %s', (*values, int(record_id)))
    finally:
        connection.close()


def delete_iap_pack_function_row(record_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM iap_pack_functions WHERE id = %s', (int(record_id),))
    finally:
        connection.close()


def list_iap_sale_rows():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM iap_sales ORDER BY is_active DESC, updated_at DESC')
            return cursor.fetchall() or []
    finally:
        connection.close()


def insert_iap_sale_row(
    name,
    pack_id,
    discount_percent,
    start_at,
    end_at,
    first_pack_purchase,
    first_iap_purchase,
    is_active,
    created_at,
):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO iap_sales
                    (name, pack_id, discount_percent, start_at, end_at, first_pack_purchase, first_iap_purchase, is_active, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    name,
                    pack_id,
                    discount_percent,
                    int(start_at),
                    int(end_at),
                    int(first_pack_purchase),
                    int(first_iap_purchase),
                    int(is_active),
                    int(created_at),
                    int(created_at),
                ),
            )
            return int(cursor.lastrowid)
    finally:
        connection.close()


def get_iap_sale_row(sale_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM iap_sales WHERE id = %s LIMIT 1', (int(sale_id),))
            return cursor.fetchone()
    finally:
        connection.close()


def delete_iap_sale_row(sale_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM iap_sales WHERE id = %s', (int(sale_id),))
    finally:
        connection.close()