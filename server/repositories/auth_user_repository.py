try:
    from utils.mysql_connection import connect_mysql, load_mysql_settings, quote_mysql_identifier, require_mysql_driver
except ImportError:
    from ..utils.mysql_connection import connect_mysql, load_mysql_settings, quote_mysql_identifier, require_mysql_driver


class AuthUserRepositoryError(RuntimeError):
    pass


_MYSQL_SETTINGS = load_mysql_settings(['AUTH'])
MYSQL_DATABASE = _MYSQL_SETTINGS['database']


def _require_driver():
    return require_mysql_driver(AuthUserRepositoryError)


def _quote_identifier(identifier):
    return quote_mysql_identifier(identifier, AuthUserRepositoryError)


def _connect(database=None):
    return connect_mysql(_MYSQL_SETTINGS, error_cls=AuthUserRepositoryError, database=database)


def ensure_auth_column(cursor, table_name, column_name, definition, database_name=MYSQL_DATABASE):
    cursor.execute(
        """
        SELECT COUNT(*) AS column_count
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s AND column_name = %s
        """,
        (database_name, table_name, column_name),
    )
    row = cursor.fetchone() or {}
    if int(row.get('column_count') or 0) == 0:
        cursor.execute(f'ALTER TABLE `{table_name}` ADD COLUMN `{column_name}` {definition}')


def ensure_auth_tables(default_user_role, default_initial_credits, local_user_id, local_user_email, local_display_name):
    driver = _require_driver()

    server_connection = _connect()
    try:
        with server_connection.cursor() as cursor:
            cursor.execute(
                f'CREATE DATABASE IF NOT EXISTS {_quote_identifier(MYSQL_DATABASE)} '
                'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
            )
    finally:
        server_connection.close()

    now = __import__('time').time()
    database_connection = _connect(MYSQL_DATABASE)
    try:
        with database_connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS auth_users (
                    id VARCHAR(80) NOT NULL PRIMARY KEY,
                    email VARCHAR(160) NOT NULL UNIQUE,
                    username VARCHAR(80) NULL UNIQUE,
                    display_name VARCHAR(80) NOT NULL,
                    role VARCHAR(16) NOT NULL DEFAULT 'user',
                    is_premium TINYINT(1) NOT NULL DEFAULT 0,
                    premium_start_at BIGINT NOT NULL DEFAULT 0,
                    premium_end_at BIGINT NOT NULL DEFAULT 0,
                    is_locked TINYINT(1) NOT NULL DEFAULT 0,
                    credits INT NOT NULL DEFAULT 0,
                    password_hash VARCHAR(255) NOT NULL,
                    password_salt VARCHAR(255) NOT NULL,
                    password_iterations INT NOT NULL,
                    created_at BIGINT NOT NULL,
                    updated_at BIGINT NOT NULL,
                    INDEX idx_auth_users_email (email),
                    INDEX idx_auth_users_role (role)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            ensure_auth_column(cursor, 'auth_users', 'username', 'VARCHAR(80) NULL UNIQUE AFTER email')
            ensure_auth_column(cursor, 'auth_users', 'role', f"VARCHAR(16) NOT NULL DEFAULT '{default_user_role}' AFTER display_name")
            ensure_auth_column(cursor, 'auth_users', 'is_premium', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER role')
            ensure_auth_column(cursor, 'auth_users', 'premium_start_at', 'BIGINT NOT NULL DEFAULT 0 AFTER is_premium')
            ensure_auth_column(cursor, 'auth_users', 'premium_end_at', 'BIGINT NOT NULL DEFAULT 0 AFTER premium_start_at')
            ensure_auth_column(cursor, 'auth_users', 'is_locked', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER premium_end_at')
            ensure_auth_column(cursor, 'auth_users', 'credits', f'INT NOT NULL DEFAULT {int(default_initial_credits)} AFTER display_name')
            cursor.execute('ALTER TABLE auth_users MODIFY COLUMN username VARCHAR(80) NULL')
            cursor.execute(f"ALTER TABLE auth_users MODIFY COLUMN role VARCHAR(16) NOT NULL DEFAULT '{default_user_role}'")
            cursor.execute('ALTER TABLE auth_users MODIFY COLUMN is_premium TINYINT(1) NOT NULL DEFAULT 0')
            cursor.execute('ALTER TABLE auth_users MODIFY COLUMN premium_start_at BIGINT NOT NULL DEFAULT 0')
            cursor.execute('ALTER TABLE auth_users MODIFY COLUMN premium_end_at BIGINT NOT NULL DEFAULT 0')
            cursor.execute('ALTER TABLE auth_users MODIFY COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0')
            cursor.execute(
                f'ALTER TABLE auth_users MODIFY COLUMN credits INT NOT NULL DEFAULT {int(default_initial_credits)}'
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
                    token_id VARCHAR(128) NOT NULL PRIMARY KEY,
                    user_id VARCHAR(80) NOT NULL,
                    expires_at BIGINT NOT NULL,
                    created_at BIGINT NOT NULL,
                    INDEX idx_auth_refresh_user (user_id),
                    INDEX idx_auth_refresh_expiry (expires_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                INSERT IGNORE INTO auth_users
                    (id, email, display_name, credits, password_hash, password_salt, password_iterations, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    local_user_id,
                    local_user_email,
                    local_display_name,
                    int(default_initial_credits),
                    '',
                    '',
                    0,
                    int(now),
                    int(now),
                ),
            )
    finally:
        database_connection.close()


def insert_legacy_auth_user_if_missing(user_payload):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT IGNORE INTO auth_users
                    (id, email, display_name, password_hash, password_salt, password_iterations, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user_payload.get('id'),
                    user_payload.get('email'),
                    user_payload.get('display_name'),
                    user_payload.get('password_hash'),
                    user_payload.get('password_salt'),
                    int(user_payload.get('password_iterations') or 200000),
                    int(user_payload.get('created_at') or 0),
                    int(user_payload.get('updated_at') or user_payload.get('created_at') or 0),
                ),
            )
    finally:
        connection.close()


def get_auth_user_row_by_identifier(identifier):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT * FROM auth_users WHERE email = %s OR username = %s LIMIT 1',
                (identifier, identifier),
            )
            return cursor.fetchone()
    finally:
        connection.close()


def get_auth_user_row_by_id(user_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM auth_users WHERE id = %s LIMIT 1', (user_id,))
            return cursor.fetchone()
    finally:
        connection.close()


def insert_auth_user_row(user_payload):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO auth_users
                    (id, email, username, display_name, role, is_premium, premium_start_at, premium_end_at, is_locked, credits, password_hash, password_salt, password_iterations, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user_payload['id'],
                    user_payload['email'],
                    user_payload.get('username') or None,
                    user_payload['display_name'],
                    user_payload['role'],
                    int(user_payload['is_premium']),
                    int(user_payload['premium_start_at']),
                    int(user_payload['premium_end_at']),
                    int(user_payload['is_locked']),
                    int(user_payload['credits']),
                    user_payload['password_hash'],
                    user_payload['password_salt'],
                    int(user_payload['password_iterations']),
                    int(user_payload['created_at']),
                    int(user_payload['updated_at']),
                ),
            )
    finally:
        connection.close()