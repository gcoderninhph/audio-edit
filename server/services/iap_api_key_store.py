import re
import secrets
import time

try:
    from services.auth_store import AuthStoreError, _require_driver, ensure_auth_schema
    from repositories.iap_api_key_repository import (
        delete_iap_api_key_row,
        ensure_iap_api_key_table,
        get_iap_api_key_row,
        insert_iap_api_key_row,
        list_active_iap_api_key_rows_by_method,
        list_iap_api_key_rows,
        touch_iap_api_key_last_used,
    )
except ImportError:
    from .auth_store import AuthStoreError, _require_driver, ensure_auth_schema
    from ..repositories.iap_api_key_repository import (
        delete_iap_api_key_row,
        ensure_iap_api_key_table,
        get_iap_api_key_row,
        insert_iap_api_key_row,
        list_active_iap_api_key_rows_by_method,
        list_iap_api_key_rows,
        touch_iap_api_key_last_used,
    )


DEFAULT_PAYMENT_HEADER_NAME = 'X-Api-Key'
DEFAULT_PAYMENT_HEADER_FORMAT = '<API_KEY>'
DEFAULT_PAYMENT_METHOD = 'POST'
API_KEY_FORMAT_PLACEHOLDER = '<API_KEY>'
MAX_HEADER_FORMAT_LENGTH = 200
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


def _normalize_header_format(value):
    normalized_value = ' '.join(str(value or DEFAULT_PAYMENT_HEADER_FORMAT).strip().split())
    if not normalized_value:
        normalized_value = DEFAULT_PAYMENT_HEADER_FORMAT
    if len(normalized_value) > MAX_HEADER_FORMAT_LENGTH:
        raise IapApiKeyValidationError(f'Header format cannot exceed {MAX_HEADER_FORMAT_LENGTH} characters.')
    if normalized_value.count(API_KEY_FORMAT_PLACEHOLDER) != 1:
        raise IapApiKeyValidationError('Header format must contain exactly one <API_KEY> placeholder.')
    return normalized_value


def _build_header_value(api_key, header_format):
    return _normalize_header_format(header_format).replace(API_KEY_FORMAT_PLACEHOLDER, str(api_key or '').strip())


def _row_to_api_key(row):
    return {
        'id': int(row.get('id') or 0),
        'name': row.get('name') or '',
        'apiKey': row.get('api_key') or '',
        'method': row.get('hook_method') or DEFAULT_PAYMENT_METHOD,
        'headerFormat': row.get('header_format') or DEFAULT_PAYMENT_HEADER_FORMAT,
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
        ensure_iap_api_key_table()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to initialize IAP API key schema') from error

    _schema_ready = True


def list_iap_api_keys():
    ensure_iap_api_key_schema()
    driver = _require_driver()
    try:
        return [_row_to_api_key(row) for row in list_iap_api_key_rows()]
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list IAP API keys') from error


def get_iap_api_key(key_id):
    ensure_iap_api_key_schema()
    driver = _require_driver()
    try:
        row = get_iap_api_key_row(key_id)
        if not row:
            raise IapApiKeyNotFoundError('IAP API key not found')
        return _row_to_api_key(row)
    except IapApiKeyNotFoundError:
        raise
    except (driver.MySQLError, ValueError) as error:
        raise AuthStoreError('Unable to load IAP API key') from error


def create_iap_api_key(
    name,
    hook_method=DEFAULT_PAYMENT_METHOD,
    header_name=DEFAULT_PAYMENT_HEADER_NAME,
    header_format=DEFAULT_PAYMENT_HEADER_FORMAT,
    is_active=True,
):
    ensure_iap_api_key_schema()
    driver = _require_driver()
    now = _now()
    api_key = f'audio_editor_{secrets.token_urlsafe(24)}'
    try:
        key_id = insert_iap_api_key_row(
            _normalize_name(name),
            api_key,
            _normalize_hook_method(hook_method),
            _normalize_header_name(header_name),
            _normalize_header_format(header_format),
            1 if _normalize_is_active(is_active) else 0,
            now,
        )
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to create IAP API key') from error
    return get_iap_api_key(key_id)


def delete_iap_api_key(key_id):
    current_key = get_iap_api_key(key_id)
    driver = _require_driver()
    try:
        delete_iap_api_key_row(current_key['id'])
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to delete IAP API key') from error
    return current_key


def _matches_key_in_headers(headers, header_name, api_key, header_format):
    if not headers:
        return False
    header_value = str(headers.get(header_name) or '').strip()
    if not header_value:
        return False

    expected_value = _build_header_value(api_key, header_format)
    if header_value == expected_value:
        return True

    if _normalize_header_format(header_format) == DEFAULT_PAYMENT_HEADER_FORMAT and str(header_name or '').strip().lower() == 'authorization':
        if header_value.lower().startswith('bearer '):
            return header_value.split(' ', 1)[1].strip() == str(api_key or '').strip()

    return False


def validate_iap_hook_request(request_method, headers):
    ensure_iap_api_key_schema()
    driver = _require_driver()
    normalized_method = _normalize_hook_method(request_method)
    try:
        rows = list_active_iap_api_key_rows_by_method(normalized_method)
        for row in rows:
            header_name = row.get('header_name') or DEFAULT_PAYMENT_HEADER_NAME
            header_format = row.get('header_format') or DEFAULT_PAYMENT_HEADER_FORMAT
            if not _matches_key_in_headers(headers, header_name, row.get('api_key') or '', header_format):
                continue
            touch_iap_api_key_last_used(row['id'], _now())
            return _row_to_api_key(row)
        raise IapApiKeyNotFoundError('IAP API key not found')
    except IapApiKeyNotFoundError:
        raise
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to validate IAP API key') from error