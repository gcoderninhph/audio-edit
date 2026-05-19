import re
import secrets
import time

try:
    from auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _ensure_column, _require_driver, ensure_auth_schema
except ImportError:
    from .auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _ensure_column, _require_driver, ensure_auth_schema


DEFAULT_PAYMENT_HEADER_NAME = 'X-Api-Key'
DEFAULT_PAYMENT_METHOD = 'POST'
MAX_API_KEY_NAME_LENGTH = 120
PAYMENT_HOOK_METHODS = ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')
HEADER_NAME_PATTERN = re.compile(r'^[A-Za-z0-9-]{2,80}$')

_schema_ready = False


class IapApiKeyNotFoundError(AuthStoreError):
    pass


class IapApiKeyValidationError(ValueError):
    pass


def _now():
    return int(time.time())


def _normalize_name(value):
    normalized_value = ' '.join(str(value or '').strip().split())
    if len(normalized_value) < 2 or len(normalized_value) > MAX_API_KEY_NAME_LENGTH:
        raise IapApiKeyValidationError(f'API key name must be between 2 and {MAX_API_KEY_NAME_LENGTH} characters.')
    return normalized_value


def _normalize_is_active(value, default=True):
    if value is None:
        return bool(default)
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {'1', 'true', 'yes', 'on'}


def _normalize_hook_method(value):
    normalized_value = str(value or DEFAULT_PAYMENT_METHOD).strip().upper()
    if normalized_value not in PAYMENT_HOOK_METHODS:
        allowed_methods = ', '.join(PAYMENT_HOOK_METHODS)
        raise IapApiKeyValidationError(f'Hook method must be one of: {allowed_methods}.')
    return normalized_value


def _normalize_header_name(value):
    normalized_value = str(value or DEFAULT_PAYMENT_HEADER_NAME).strip()
    if not HEADER_NAME_PATTERN.fullmatch(normalized_value):
        raise IapApiKeyValidationError('Header name must be 2-80 characters and use only letters, numbers, or dashes.')
    return normalized_value


def _row_to_api_key(row):
    return {
        'id': int(row.get('id') or 0),
        'name': row.get('name') or '',
        'apiKey': row.get('api_key') or '',
        'method': row.get('hook_method') or DEFAULT_PAYMENT_METHOD,
        'headerName': row.get('header_name') or DEFAULT_PAYMENT_HEADER_NAME,
        'isActive': bool(row.get('is_active') or 0),
        'lastUsedAt': int(row.get('last_used_at') or 0),
        'createdAt': int(row.get('created_at') or 0),
        'updatedAt': int(row.get('updated_at') or 0),
    }


def ensure_iap_api_key_schema():
    global _schema_ready
    if _schema_ready:
        return

    ensure_auth_schema()
    driver = _require_driver()
    try:
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
                cursor.execute("ALTER TABLE iap_api_keys MODIFY COLUMN hook_method VARCHAR(8) NOT NULL DEFAULT 'POST'")
                cursor.execute("ALTER TABLE iap_api_keys MODIFY COLUMN header_name VARCHAR(80) NOT NULL DEFAULT 'X-Api-Key'")
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to initialize IAP API key schema') from error

    _schema_ready = True


def list_iap_api_keys():
    ensure_iap_api_key_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM iap_api_keys ORDER BY is_active DESC, updated_at DESC')
                return [_row_to_api_key(row) for row in cursor.fetchall() or []]
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list IAP API keys') from error


def get_iap_api_key(key_id):
    ensure_iap_api_key_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM iap_api_keys WHERE id = %s LIMIT 1', (int(key_id),))
                row = cursor.fetchone()
                if not row:
                    raise IapApiKeyNotFoundError('IAP API key not found')
                return _row_to_api_key(row)
        finally:
            connection.close()
    except IapApiKeyNotFoundError:
        raise
    except (driver.MySQLError, ValueError) as error:
        raise AuthStoreError('Unable to load IAP API key') from error


def create_iap_api_key(name, hook_method=DEFAULT_PAYMENT_METHOD, header_name=DEFAULT_PAYMENT_HEADER_NAME, is_active=True):
    ensure_iap_api_key_schema()
    driver = _require_driver()
    now = _now()
    api_key = f'audio_editor_{secrets.token_urlsafe(24)}'
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO iap_api_keys (name, api_key, hook_method, header_name, is_active, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        _normalize_name(name),
                        api_key,
                        _normalize_hook_method(hook_method),
                        _normalize_header_name(header_name),
                        1 if _normalize_is_active(is_active) else 0,
                        now,
                        now,
                    ),
                )
                key_id = cursor.lastrowid
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to create IAP API key') from error
    return get_iap_api_key(key_id)


def delete_iap_api_key(key_id):
    current_key = get_iap_api_key(key_id)
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('DELETE FROM iap_api_keys WHERE id = %s', (current_key['id'],))
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to delete IAP API key') from error
    return current_key


def _extract_key_from_headers(headers, header_name):
    if not headers:
        return ''
    header_value = str(headers.get(header_name) or '').strip()
    if header_name.lower() == 'authorization' and header_value.lower().startswith('bearer '):
        return header_value.split(' ', 1)[1].strip()
    return header_value


def validate_iap_hook_request(request_method, headers):
    ensure_iap_api_key_schema()
    driver = _require_driver()
    normalized_method = _normalize_hook_method(request_method)
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    'SELECT * FROM iap_api_keys WHERE is_active = 1 AND hook_method = %s ORDER BY updated_at DESC',
                    (normalized_method,),
                )
                rows = cursor.fetchall() or []
                for row in rows:
                    header_name = row.get('header_name') or DEFAULT_PAYMENT_HEADER_NAME
                    if _extract_key_from_headers(headers, header_name) != (row.get('api_key') or ''):
                        continue
                    cursor.execute('UPDATE iap_api_keys SET last_used_at = %s WHERE id = %s', (_now(), row['id']))
                    return _row_to_api_key(row)
                raise IapApiKeyNotFoundError('IAP API key not found')
        finally:
            connection.close()
    except IapApiKeyNotFoundError:
        raise
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to validate IAP API key') from error