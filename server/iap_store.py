import re
import time
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

try:
    from auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _ensure_column, _require_driver, ensure_auth_schema
except ImportError:
    from .auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _ensure_column, _require_driver, ensure_auth_schema


DEFAULT_IAP_CURRENCY = 'VND'
DEFAULT_IAP_PACK_TYPE = 'addCredit'
IAP_PACK_TYPES = {'addCredit', 'premiumSubscribe', 'creditsAndPremiumPack'}
MAX_IAP_DESCRIPTION_LENGTH = 500
MAX_IAP_NAME_LENGTH = 120
PACKAGE_ID_PATTERN = re.compile(r'^[a-z0-9][a-z0-9._-]{2,79}$')

_schema_ready = False


class DuplicateIapPackageError(AuthStoreError):
    pass


class IapPackageNotFoundError(AuthStoreError):
    pass


class IapPackageValidationError(ValueError):
    pass


def _normalize_package_id(value):
    normalized_value = str(value or '').strip().lower()
    if not PACKAGE_ID_PATTERN.fullmatch(normalized_value):
        raise IapPackageValidationError('Package id must be 3-80 characters and use only letters, numbers, dots, dashes, or underscores.')
    return normalized_value


def _normalize_name(value):
    normalized_value = ' '.join(str(value or '').strip().split())
    if len(normalized_value) < 2 or len(normalized_value) > MAX_IAP_NAME_LENGTH:
        raise IapPackageValidationError(f'Package name must be between 2 and {MAX_IAP_NAME_LENGTH} characters.')
    return normalized_value


def _normalize_price(value):
    try:
        normalized_value = Decimal(str(value or '0')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError) as error:
        raise IapPackageValidationError('Package price must be a valid number.') from error
    if normalized_value <= 0:
        raise IapPackageValidationError('Package price must be greater than 0.')
    return normalized_value


def _normalize_currency(value):
    normalized_value = str(value or DEFAULT_IAP_CURRENCY).strip().upper()
    if len(normalized_value) != 3 or not normalized_value.isalpha():
        raise IapPackageValidationError('Currency must be a 3-letter code such as VND or USD.')
    return normalized_value


def _normalize_credits(value):
    try:
        normalized_value = int(value or 0)
    except (TypeError, ValueError) as error:
        raise IapPackageValidationError('Credits must be an integer value.') from error
    if normalized_value < 0:
        raise IapPackageValidationError('Credits cannot be negative.')
    return normalized_value


def _normalize_pack_type(value):
    normalized_value = str(value or DEFAULT_IAP_PACK_TYPE).strip()
    if normalized_value not in IAP_PACK_TYPES:
        raise IapPackageValidationError('Pack type must be addCredit, premiumSubscribe, or creditsAndPremiumPack.')
    return normalized_value


def _normalize_description(value):
    normalized_value = str(value or '').strip()
    if len(normalized_value) > MAX_IAP_DESCRIPTION_LENGTH:
        raise IapPackageValidationError(f'Description cannot exceed {MAX_IAP_DESCRIPTION_LENGTH} characters.')
    return normalized_value


def _normalize_is_active(value):
    if isinstance(value, bool):
        return value
    return str(value or '').strip().lower() in {'1', 'true', 'yes', 'on'}


def _normalize_is_recommended(value):
    if isinstance(value, bool):
        return value
    return str(value or '').strip().lower() in {'1', 'true', 'yes', 'on'}


def _row_to_iap_package(row):
    if not row:
        return None
    return {
        'id': row.get('id') or '',
        'name': row.get('name') or '',
        'packType': _normalize_pack_type(row.get('pack_type') or DEFAULT_IAP_PACK_TYPE),
        'price': float(row.get('price') or 0),
        'currency': row.get('currency') or DEFAULT_IAP_CURRENCY,
        'credits': int(row.get('credits') or 0),
        'description': row.get('description') or '',
        'isActive': bool(row.get('is_active') or 0),
        'isRecommended': bool(row.get('is_recommended') or 0),
        'createdAt': int(row.get('created_at') or 0),
        'updatedAt': int(row.get('updated_at') or 0),
    }


def ensure_iap_package_schema():
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
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to initialize IAP package schema') from error

    _schema_ready = True


def list_iap_packages(include_inactive=False):
    ensure_iap_package_schema()
    driver = _require_driver()
    where_clause = '' if include_inactive else ' WHERE is_active = 1'
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    f'SELECT * FROM iap_packages{where_clause} ORDER BY is_active DESC, is_recommended DESC, updated_at DESC, created_at DESC'
                )
                return [_row_to_iap_package(row) for row in cursor.fetchall() or []]
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list IAP packages') from error


def get_iap_package(package_id):
    ensure_iap_package_schema()
    driver = _require_driver()
    normalized_package_id = _normalize_package_id(package_id)
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM iap_packages WHERE id = %s LIMIT 1', (normalized_package_id,))
                package = _row_to_iap_package(cursor.fetchone() or None)
                if not package:
                    raise IapPackageNotFoundError('IAP package not found')
                return package
        finally:
            connection.close()
    except IapPackageNotFoundError:
        raise
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to load IAP package') from error


def create_iap_package(package_id, name, price, currency=None, credits=0, description='', is_active=True, is_recommended=False, pack_type=None):
    ensure_iap_package_schema()
    driver = _require_driver()
    normalized_package = {
        'id': _normalize_package_id(package_id),
        'name': _normalize_name(name),
        'pack_type': _normalize_pack_type(pack_type),
        'price': _normalize_price(price),
        'currency': _normalize_currency(currency),
        'credits': _normalize_credits(credits),
        'description': _normalize_description(description),
        'is_active': 1 if _normalize_is_active(is_active) else 0,
        'is_recommended': 1 if _normalize_is_recommended(is_recommended) else 0,
    }
    now = int(time.time())
    try:
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
                        normalized_package['id'],
                        normalized_package['name'],
                        normalized_package['pack_type'],
                        str(normalized_package['price']),
                        normalized_package['currency'],
                        normalized_package['credits'],
                        normalized_package['description'],
                        normalized_package['is_active'],
                        normalized_package['is_recommended'],
                        now,
                        now,
                    ),
                )
        finally:
            connection.close()
    except driver.MySQLError as error:
        if int((error.args or [0])[0] or 0) == 1062:
            raise DuplicateIapPackageError('This IAP package id already exists.') from error
        raise AuthStoreError('Unable to create IAP package') from error

    return get_iap_package(normalized_package['id'])


def update_iap_package(package_id, name=None, price=None, currency=None, credits=None, description=None, is_active=None, is_recommended=None, pack_type=None):
    ensure_iap_package_schema()
    driver = _require_driver()
    current_package = get_iap_package(package_id)
    updates = {}
    if name is not None:
        updates['name'] = _normalize_name(name)
    if pack_type is not None:
        updates['pack_type'] = _normalize_pack_type(pack_type)
    if price is not None:
        updates['price'] = _normalize_price(price)
    if currency is not None:
        updates['currency'] = _normalize_currency(currency)
    if credits is not None:
        updates['credits'] = _normalize_credits(credits)
    if description is not None:
        updates['description'] = _normalize_description(description)
    if is_active is not None:
        updates['is_active'] = 1 if _normalize_is_active(is_active) else 0
    if is_recommended is not None:
        updates['is_recommended'] = 1 if _normalize_is_recommended(is_recommended) else 0
    if not updates:
        raise IapPackageValidationError('No IAP package changes were provided.')

    updates['updated_at'] = int(time.time())
    assignments = ', '.join(f'{column} = %s' for column in updates)
    values = [str(value) if isinstance(value, Decimal) else value for value in updates.values()]
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    f'UPDATE iap_packages SET {assignments} WHERE id = %s',
                    (*values, current_package['id']),
                )
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to update IAP package') from error

    return get_iap_package(current_package['id'])


def delete_iap_package(package_id):
    ensure_iap_package_schema()
    driver = _require_driver()
    current_package = get_iap_package(package_id)
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('DELETE FROM iap_packages WHERE id = %s', (current_package['id'],))
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to delete IAP package') from error

    return current_package
