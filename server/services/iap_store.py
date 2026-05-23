import re
import time
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

try:
    from services.auth_store import AuthStoreError, _require_driver, ensure_auth_schema
    from repositories.iap_package_repository import (
        delete_iap_package_row,
        ensure_iap_package_table,
        get_iap_package_row,
        insert_iap_package_row,
        list_iap_package_rows,
        update_iap_package_row,
    )
except ImportError:
    from .auth_store import AuthStoreError, _require_driver, ensure_auth_schema
    from ..repositories.iap_package_repository import (
        delete_iap_package_row,
        ensure_iap_package_table,
        get_iap_package_row,
        insert_iap_package_row,
        list_iap_package_rows,
        update_iap_package_row,
    )


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
        ensure_iap_package_table()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to initialize IAP package schema') from error

    _schema_ready = True


def list_iap_packages(include_inactive=False):
    ensure_iap_package_schema()
    driver = _require_driver()
    try:
        return [_row_to_iap_package(row) for row in list_iap_package_rows(include_inactive=include_inactive)]
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list IAP packages') from error


def get_iap_package(package_id):
    ensure_iap_package_schema()
    driver = _require_driver()
    normalized_package_id = _normalize_package_id(package_id)
    try:
        package = _row_to_iap_package(get_iap_package_row(normalized_package_id))
        if not package:
            raise IapPackageNotFoundError('IAP package not found')
        return package
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
        insert_iap_package_row(normalized_package, now)
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
    serialized_updates = {
        column: (str(value) if isinstance(value, Decimal) else value)
        for column, value in updates.items()
    }
    try:
        update_iap_package_row(current_package['id'], serialized_updates)
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to update IAP package') from error

    return get_iap_package(current_package['id'])


def delete_iap_package(package_id):
    ensure_iap_package_schema()
    driver = _require_driver()
    current_package = get_iap_package(package_id)
    try:
        delete_iap_package_row(current_package['id'])
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to delete IAP package') from error

    return current_package
