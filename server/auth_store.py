import json
import os

try:
    import pymysql
except ImportError as import_error:
    pymysql = None
    PYMYSQL_IMPORT_ERROR = import_error
else:
    PYMYSQL_IMPORT_ERROR = None


MYSQL_HOST = os.environ.get('AUTH_MYSQL_HOST') or os.environ.get('MYSQL_HOST', 'localhost')
MYSQL_PORT = int(os.environ.get('AUTH_MYSQL_PORT') or os.environ.get('MYSQL_PORT', '3306'))
MYSQL_USER = os.environ.get('AUTH_MYSQL_USER') or os.environ.get('MYSQL_USER', 'root')
MYSQL_PASSWORD = os.environ.get('AUTH_MYSQL_PASSWORD') or os.environ.get('MYSQL_PASSWORD', '12345678')
MYSQL_DATABASE = os.environ.get('AUTH_MYSQL_DATABASE') or os.environ.get('MYSQL_DATABASE', 'audio_studio')
LEGACY_AUTH_USER_STORE_PATH = os.environ.get(
    'AUTH_USER_STORE_PATH',
    os.path.join(os.path.dirname(__file__), 'uploads', 'auth-users.json')
)

_schema_ready = False


class AuthStoreError(RuntimeError):
    pass


class DuplicateUserError(AuthStoreError):
    pass


def _require_driver():
    if pymysql is None:
        raise AuthStoreError('PyMySQL is not installed') from PYMYSQL_IMPORT_ERROR
    return pymysql


def _quote_identifier(identifier):
    safe_identifier = ''.join(ch for ch in str(identifier or '') if ch.isalnum() or ch == '_')
    if not safe_identifier:
        raise AuthStoreError('Invalid MySQL database name')
    return f'`{safe_identifier}`'


def _connect(database=None):
    driver = _require_driver()
    try:
        return driver.connect(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=database,
            charset='utf8mb4',
            cursorclass=driver.cursors.DictCursor,
            autocommit=True,
        )
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to connect to MySQL') from error


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


def _row_to_user_record(row):
    if not row:
        return None
    return {
        'id': row['id'],
        'email': row['email'],
        'displayName': row.get('display_name') or row['email'].split('@', 1)[0],
        'passwordHash': row.get('password_hash') or '',
        'passwordSalt': row.get('password_salt') or '',
        'passwordIterations': row.get('password_iterations') or 0,
        'createdAt': row.get('created_at') or 0,
    }


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
                        display_name VARCHAR(80) NOT NULL,
                        password_hash VARCHAR(255) NOT NULL,
                        password_salt VARCHAR(255) NOT NULL,
                        password_iterations INT NOT NULL,
                        created_at BIGINT NOT NULL,
                        updated_at BIGINT NOT NULL,
                        INDEX idx_auth_users_email (email)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    """
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
                _migrate_legacy_json_users(cursor)
        finally:
            database_connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to initialize auth database schema') from error

    _schema_ready = True


def find_registered_user(email):
    ensure_auth_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM auth_users WHERE email = %s LIMIT 1', (email,))
                return _row_to_user_record(cursor.fetchone())
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to read auth user') from error


def create_registered_user(user_record):
    ensure_auth_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO auth_users
                        (id, email, display_name, password_hash, password_salt, password_iterations, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        user_record['id'],
                        user_record['email'],
                        user_record['displayName'],
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


def cleanup_refresh_tokens(now):
    ensure_auth_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('DELETE FROM auth_refresh_tokens WHERE expires_at <= %s', (int(now),))
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to clean refresh tokens') from error


def store_refresh_token(token_id, user_id, expires_at, created_at):
    ensure_auth_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO auth_refresh_tokens (token_id, user_id, expires_at, created_at)
                    VALUES (%s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), expires_at = VALUES(expires_at)
                    """,
                    (token_id, user_id, int(expires_at), int(created_at)),
                )
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to store refresh token') from error


def get_refresh_token(token_id, now):
    ensure_auth_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM auth_refresh_tokens WHERE token_id = %s LIMIT 1', (token_id,))
                row = cursor.fetchone()
                if not row:
                    return None
                if int(row['expires_at']) <= int(now):
                    cursor.execute('DELETE FROM auth_refresh_tokens WHERE token_id = %s', (token_id,))
                    return None
                return {
                    'tokenId': row['token_id'],
                    'userId': row['user_id'],
                    'expiresAt': int(row['expires_at']),
                }
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to read refresh token') from error


def revoke_refresh_token(token_id):
    if not token_id:
        return

    ensure_auth_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('DELETE FROM auth_refresh_tokens WHERE token_id = %s', (token_id,))
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to revoke refresh token') from error