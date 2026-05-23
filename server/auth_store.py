import json
import os
import time

try:
    from mysql_connection import connect_mysql, load_mysql_settings, quote_mysql_identifier, require_mysql_driver
except ImportError:
    from .mysql_connection import connect_mysql, load_mysql_settings, quote_mysql_identifier, require_mysql_driver

try:
    from auth_user_record import (
        _normalize_is_locked,
        _normalize_is_premium,
        _normalize_role,
        _row_to_user_record,
        build_premium_state,
        normalize_premium_window,
    )
except ImportError:
    from .auth_user_record import (
        _normalize_is_locked,
        _normalize_is_premium,
        _normalize_role,
        _row_to_user_record,
        build_premium_state,
        normalize_premium_window,
    )

_MYSQL_SETTINGS = load_mysql_settings(['AUTH'])
MYSQL_HOST = _MYSQL_SETTINGS['host']
MYSQL_PORT = _MYSQL_SETTINGS['port']
MYSQL_USER = _MYSQL_SETTINGS['user']
MYSQL_PASSWORD = _MYSQL_SETTINGS['password']
MYSQL_DATABASE = _MYSQL_SETTINGS['database']
DEFAULT_INITIAL_CREDITS = int(os.environ.get('AUTH_INITIAL_CREDITS', '1000'))
DEFAULT_USER_ROLE = 'user'
ADMIN_USER_ROLE = 'admin'
LOCAL_AUTH_USER_ID = os.environ.get('AUTH_USER_ID', 'local-user')
LOCAL_AUTH_EMAIL = str(os.environ.get('AUTH_USERNAME', 'demo@local')).strip().lower()
LOCAL_AUTH_DISPLAY_NAME = os.environ.get('AUTH_DISPLAY_NAME', 'Local Editor')
LEGACY_AUTH_USER_STORE_PATH = os.environ.get(
    'AUTH_USER_STORE_PATH',
    os.path.join(os.path.dirname(__file__), 'uploads', 'auth-users.json')
)

_schema_ready = False


class AuthStoreError(RuntimeError):
    pass


class DuplicateUserError(AuthStoreError):
    pass


class InsufficientCreditsError(AuthStoreError):
    def __init__(self, available_credits, required_credits):
        super().__init__('Not enough credits')
        self.available_credits = max(0, int(available_credits or 0))
        self.required_credits = max(0, int(required_credits or 0))


def _require_driver():
    return require_mysql_driver(AuthStoreError)


def _quote_identifier(identifier):
    return quote_mysql_identifier(identifier, AuthStoreError)


def _connect(database=None):
    return connect_mysql(_MYSQL_SETTINGS, error_cls=AuthStoreError, database=database)


def _read_legacy_json_users():
    try:
        with open(LEGACY_AUTH_USER_STORE_PATH, 'r', encoding='utf-8') as user_file:
            payload = json.load(user_file)
    except FileNotFoundError:
        return []
    except (OSError, json.JSONDecodeError):
        return []

    users = payload.get('users') if isinstance(payload, dict) else payload
    return users if isinstance(users, list) else []


def _migrate_legacy_json_users(cursor):
    for user in _read_legacy_json_users():
        email = str(user.get('email') or '').strip().lower()
        if not email or not user.get('passwordHash') or not user.get('passwordSalt'):
            continue
        cursor.execute(
            """
            INSERT IGNORE INTO auth_users
                (id, email, display_name, password_hash, password_salt, password_iterations, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                user.get('id'),
                email,
                user.get('displayName') or email.split('@', 1)[0],
                user.get('passwordHash'),
                user.get('passwordSalt'),
                int(user.get('passwordIterations') or 200000),
                int(user.get('createdAt') or 0),
                int(user.get('createdAt') or 0),
            ),
        )


def _ensure_column(cursor, table_name, column_name, definition):
    cursor.execute(
        """
        SELECT COUNT(*) AS column_count
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s AND column_name = %s
        """,
        (MYSQL_DATABASE, table_name, column_name),
    )
    row = cursor.fetchone() or {}
    if int(row.get('column_count') or 0) == 0:
        cursor.execute(f'ALTER TABLE `{table_name}` ADD COLUMN `{column_name}` {definition}')


def ensure_auth_schema():
    global _schema_ready
    if _schema_ready:
        return

    driver = _require_driver()
    try:
        server_connection = _connect()
        try:
            with server_connection.cursor() as cursor:
                cursor.execute(
                    f'CREATE DATABASE IF NOT EXISTS {_quote_identifier(MYSQL_DATABASE)} '
                    'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
                )
        finally:
            server_connection.close()

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
                _ensure_column(cursor, 'auth_users', 'username', 'VARCHAR(80) NULL UNIQUE AFTER email')
                _ensure_column(cursor, 'auth_users', 'role', f"VARCHAR(16) NOT NULL DEFAULT '{DEFAULT_USER_ROLE}' AFTER display_name")
                _ensure_column(cursor, 'auth_users', 'is_premium', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER role')
                _ensure_column(cursor, 'auth_users', 'premium_start_at', 'BIGINT NOT NULL DEFAULT 0 AFTER is_premium')
                _ensure_column(cursor, 'auth_users', 'premium_end_at', 'BIGINT NOT NULL DEFAULT 0 AFTER premium_start_at')
                _ensure_column(cursor, 'auth_users', 'is_locked', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER premium_end_at')
                try:
                    cursor.execute(
                        f'ALTER TABLE auth_users ADD COLUMN credits INT NOT NULL DEFAULT {DEFAULT_INITIAL_CREDITS} AFTER display_name'
                    )
                except driver.MySQLError as error:
                    if int((error.args or [0])[0] or 0) != 1060:
                        raise
                cursor.execute('ALTER TABLE auth_users MODIFY COLUMN username VARCHAR(80) NULL')
                cursor.execute(f"ALTER TABLE auth_users MODIFY COLUMN role VARCHAR(16) NOT NULL DEFAULT '{DEFAULT_USER_ROLE}'")
                cursor.execute('ALTER TABLE auth_users MODIFY COLUMN is_premium TINYINT(1) NOT NULL DEFAULT 0')
                cursor.execute('ALTER TABLE auth_users MODIFY COLUMN premium_start_at BIGINT NOT NULL DEFAULT 0')
                cursor.execute('ALTER TABLE auth_users MODIFY COLUMN premium_end_at BIGINT NOT NULL DEFAULT 0')
                cursor.execute('ALTER TABLE auth_users MODIFY COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0')
                cursor.execute(
                    f'ALTER TABLE auth_users MODIFY COLUMN credits INT NOT NULL DEFAULT {DEFAULT_INITIAL_CREDITS}'
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
                now = int(time.time())
                cursor.execute(
                    """
                    INSERT IGNORE INTO auth_users
                        (id, email, display_name, credits, password_hash, password_salt, password_iterations, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        LOCAL_AUTH_USER_ID,
                        LOCAL_AUTH_EMAIL,
                        LOCAL_AUTH_DISPLAY_NAME,
                        DEFAULT_INITIAL_CREDITS,
                        '',
                        '',
                        0,
                        now,
                        now,
                    ),
                )
                _migrate_legacy_json_users(cursor)
        finally:
            database_connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to initialize auth database schema') from error

    _schema_ready = True


def find_registered_user(email):
    ensure_auth_schema()
    driver = _require_driver()
    identifier = str(email or '').strip().lower()
    if not identifier:
        return None
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    'SELECT * FROM auth_users WHERE email = %s OR username = %s LIMIT 1',
                    (identifier, identifier),
                )
                return _row_to_user_record(cursor.fetchone())
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to read auth user') from error


def find_user_by_id(user_id):
    ensure_auth_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM auth_users WHERE id = %s LIMIT 1', (user_id,))
                return _row_to_user_record(cursor.fetchone())
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to read auth user') from error


def create_registered_user(user_record):
    ensure_auth_schema()
    driver = _require_driver()
    normalized_role = _normalize_role(user_record.get('role'))
    normalized_is_locked = _normalize_is_locked(
        user_record['isLocked'] if 'isLocked' in user_record else user_record.get('is_locked')
    )
    normalized_premium_start_at, normalized_premium_end_at = normalize_premium_window(
        user_record['premiumStartAt'] if 'premiumStartAt' in user_record else user_record.get('premium_start_at'),
        user_record['premiumEndAt'] if 'premiumEndAt' in user_record else user_record.get('premium_end_at'),
        allow_empty=True,
    )
    premium_state = build_premium_state(
        normalized_premium_start_at,
        normalized_premium_end_at,
        legacy_is_premium=user_record['isPremium'] if 'isPremium' in user_record else user_record.get('is_premium'),
    )
    if normalized_role == ADMIN_USER_ROLE:
        normalized_is_locked = False
    try:
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
                        user_record['id'],
                        user_record['email'],
                        user_record.get('username') or None,
                        user_record['displayName'],
                        normalized_role,
                        1 if premium_state['isPremium'] else 0,
                        normalized_premium_start_at,
                        normalized_premium_end_at,
                        1 if normalized_is_locked else 0,
                        int(user_record.get('credits') or DEFAULT_INITIAL_CREDITS),
                        user_record['passwordHash'],
                        user_record['passwordSalt'],
                        int(user_record['passwordIterations']),
                        int(user_record['createdAt']),
                        int(user_record['createdAt']),
                    ),
                )
        finally:
            connection.close()
    except driver.err.IntegrityError as error:
        raise DuplicateUserError('This email is already registered') from error
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to create auth user') from error


def update_user_credits(user_id, delta_credits, **kwargs):
    try:
        from auth_credit_store import update_user_credits as update_user_credits_impl
    except ImportError:
        from .auth_credit_store import update_user_credits as update_user_credits_impl

    return update_user_credits_impl(user_id, delta_credits, **kwargs)


def debit_user_credits(user_id, amount, **kwargs):
    try:
        from auth_credit_store import debit_user_credits as debit_user_credits_impl
    except ImportError:
        from .auth_credit_store import debit_user_credits as debit_user_credits_impl

    return debit_user_credits_impl(user_id, amount, **kwargs)


def refund_user_credits(user_id, amount, **kwargs):
    try:
        from auth_credit_store import refund_user_credits as refund_user_credits_impl
    except ImportError:
        from .auth_credit_store import refund_user_credits as refund_user_credits_impl

    return refund_user_credits_impl(user_id, amount, **kwargs)


try:
    from auth_refresh_store import (
        cleanup_refresh_tokens,
        get_refresh_token,
        revoke_refresh_token,
        revoke_refresh_tokens_for_user,
        store_refresh_token,
    )
except ImportError:
    from .auth_refresh_store import (
        cleanup_refresh_tokens,
        get_refresh_token,
        revoke_refresh_token,
        revoke_refresh_tokens_for_user,
        store_refresh_token,
    )