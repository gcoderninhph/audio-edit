import time
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

try:
    from services.auth_store import AuthStoreError, _require_driver, ensure_auth_schema
    from repositories.iap_admin_repository import (
        delete_iap_pack_function_row,
        delete_iap_sale_row,
        ensure_iap_admin_tables,
        get_iap_pack_function_row,
        get_iap_sale_row,
        insert_iap_pack_function_row,
        insert_iap_sale_row,
        list_iap_pack_function_rows,
        list_iap_sale_rows,
        update_iap_pack_function_row,
    )
except ImportError:
    from .auth_store import AuthStoreError, _require_driver, ensure_auth_schema
    from ..repositories.iap_admin_repository import (
        delete_iap_pack_function_row,
        delete_iap_sale_row,
        ensure_iap_admin_tables,
        get_iap_pack_function_row,
        get_iap_sale_row,
        insert_iap_pack_function_row,
        insert_iap_sale_row,
        list_iap_pack_function_rows,
        list_iap_sale_rows,
        update_iap_pack_function_row,
    )


MAX_IAP_ADMIN_NAME_LENGTH = 120
MAX_PACK_ID_LENGTH = 80
PACK_FUNCTION_TYPES = {'addCredits', 'unlockPremium', 'creditsAndPremium'}
PREMIUM_MODES = {'none', 'timed', 'lifetime'}

_schema_ready = False


class IapAdminNotFoundError(AuthStoreError):
    pass


class IapAdminValidationError(ValueError):
    pass

def _now():
    return int(time.time())


def _normalize_bool(value, default=True):
    if value is None:
        return bool(default)
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {'1', 'true', 'yes', 'on'}


def _normalize_name(value, field_name='Name'):
    normalized_value = ' '.join(str(value or '').strip().split())
    if len(normalized_value) < 2 or len(normalized_value) > MAX_IAP_ADMIN_NAME_LENGTH:
        raise IapAdminValidationError(f'{field_name} must be between 2 and {MAX_IAP_ADMIN_NAME_LENGTH} characters.')
    return normalized_value


def _normalize_pack_id(value, field_name='Pack id'):
    normalized_value = str(value or '').strip().lower()
    if len(normalized_value) < 3 or len(normalized_value) > MAX_PACK_ID_LENGTH:
        raise IapAdminValidationError(f'{field_name} must be between 3 and {MAX_PACK_ID_LENGTH} characters.')
    if not all(character.isalnum() or character in '._-' for character in normalized_value):
        raise IapAdminValidationError(f'{field_name} can only use letters, numbers, dots, dashes, or underscores.')
    return normalized_value


def _normalize_credits(value):
    try:
        normalized_value = int(value or 0)
    except (TypeError, ValueError) as error:
        raise IapAdminValidationError('Credits must be an integer value.') from error
    if normalized_value < 0:
        raise IapAdminValidationError('Credits cannot be negative.')
    return normalized_value


def _normalize_premium_duration_days(value):
    try:
        normalized_value = int(value or 0)
    except (TypeError, ValueError) as error:
        raise IapAdminValidationError('Premium duration days must be an integer value.') from error
    if normalized_value < 0:
        raise IapAdminValidationError('Premium duration days cannot be negative.')
    return normalized_value


def _normalize_discount(value):
    try:
        normalized_value = Decimal(str(value or '0')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError) as error:
        raise IapAdminValidationError('Discount must be a valid number.') from error
    if normalized_value < 0 or normalized_value > 100:
        raise IapAdminValidationError('Discount must be between 0 and 100.')
    return normalized_value


def _normalize_timestamp(value):
    if value in (None, ''):
        return 0
    try:
        normalized_value = int(value)
    except (TypeError, ValueError) as error:
        raise IapAdminValidationError('Time values must be unix timestamps in seconds.') from error
    if normalized_value < 0:
        raise IapAdminValidationError('Time values cannot be negative.')
    return normalized_value


def _row_to_pack_function(row):
    return {
        'id': int(row.get('id') or 0),
        'packIapId': row.get('pack_iap_id') or '',
        'functionType': row.get('function_type') or 'addCredits',
        'credits': int(row.get('credits') or 0),
        'premiumMode': row.get('premium_mode') or 'none',
        'premiumDurationDays': int(row.get('premium_duration_days') or 0),
        'isActive': bool(row.get('is_active') or 0),
        'createdAt': int(row.get('created_at') or 0),
        'updatedAt': int(row.get('updated_at') or 0),
    }


def _row_to_sale(row):
    return {
        'id': int(row.get('id') or 0),
        'name': row.get('name') or '',
        'packId': row.get('pack_id') or '',
        'discountPercent': float(row.get('discount_percent') or 0),
        'startAt': int(row.get('start_at') or 0),
        'endAt': int(row.get('end_at') or 0),
        'firstPackPurchase': bool(row.get('first_pack_purchase') or 0),
        'firstIapPurchase': bool(row.get('first_iap_purchase') or 0),
        'isActive': bool(row.get('is_active') or 0),
        'createdAt': int(row.get('created_at') or 0),
        'updatedAt': int(row.get('updated_at') or 0),
    }


def ensure_iap_admin_schema():
    global _schema_ready
    if _schema_ready:
        return

    ensure_auth_schema()
    driver = _require_driver()
    try:
        ensure_iap_admin_tables()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to initialize IAP admin schema') from error

    _schema_ready = True

def list_iap_pack_functions():
    ensure_iap_admin_schema()
    driver = _require_driver()
    try:
        return [_row_to_pack_function(row) for row in list_iap_pack_function_rows()]
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list IAP pack functions') from error

def create_iap_pack_function(pack_iap_id, function_type, credits=0, premium_mode='none', premium_duration_days=0, is_active=True):
    ensure_iap_admin_schema()
    normalized_function_type = str(function_type or '').strip()
    if normalized_function_type not in PACK_FUNCTION_TYPES:
        raise IapAdminValidationError('Pack function must be addCredits, unlockPremium, or creditsAndPremium.')
    uses_premium = normalized_function_type in {'unlockPremium', 'creditsAndPremium'}
    normalized_premium_duration_days = _normalize_premium_duration_days(premium_duration_days)
    normalized_premium_mode = str(premium_mode or ('timed' if uses_premium else 'none')).strip()
    if normalized_premium_mode not in PREMIUM_MODES:
        raise IapAdminValidationError('Premium mode must be none, timed, or lifetime.')
    if not uses_premium:
        normalized_premium_mode = 'none'
        normalized_premium_duration_days = 0
    elif normalized_premium_mode == 'none' and normalized_premium_duration_days > 0:
        normalized_premium_mode = 'timed'
    if uses_premium and normalized_premium_mode == 'none':
        raise IapAdminValidationError('Premium pack functions require a premium duration in days.')
    if normalized_premium_mode == 'timed' and normalized_premium_duration_days <= 0:
        raise IapAdminValidationError('Premium duration days must be greater than 0.')
    if normalized_premium_mode == 'lifetime':
        normalized_premium_duration_days = 0
    driver = _require_driver()
    now = _now()
    try:
        record_id = insert_iap_pack_function_row(
            _normalize_pack_id(pack_iap_id, 'packIapId'),
            normalized_function_type,
            _normalize_credits(credits),
            normalized_premium_mode,
            normalized_premium_duration_days,
            1 if _normalize_bool(is_active) else 0,
            now,
        )
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to create IAP pack function') from error
    return get_iap_pack_function(record_id)

def get_iap_pack_function(record_id):
    ensure_iap_admin_schema()
    driver = _require_driver()
    try:
        row = get_iap_pack_function_row(record_id)
        if not row:
            raise IapAdminNotFoundError('IAP pack function not found')
        return _row_to_pack_function(row)
    except IapAdminNotFoundError:
        raise
    except (driver.MySQLError, ValueError) as error:
        raise AuthStoreError('Unable to load IAP pack function') from error

def update_iap_pack_function(record_id, pack_iap_id=None, function_type=None, credits=None, premium_mode=None, premium_duration_days=None, is_active=None):
    current_record = get_iap_pack_function(record_id)
    if all(value is None for value in (pack_iap_id, function_type, credits, premium_mode, premium_duration_days, is_active)):
        raise IapAdminValidationError('No IAP pack function changes were provided.')
    normalized_function_type = str(function_type or current_record['functionType']).strip()
    if normalized_function_type not in PACK_FUNCTION_TYPES:
        raise IapAdminValidationError('Pack function must be addCredits, unlockPremium, or creditsAndPremium.')
    uses_premium = normalized_function_type in {'unlockPremium', 'creditsAndPremium'}
    normalized_premium_duration_days = _normalize_premium_duration_days(current_record['premiumDurationDays'] if premium_duration_days is None else premium_duration_days)
    normalized_premium_mode = str((current_record['premiumMode'] if premium_mode is None else premium_mode) or ('timed' if uses_premium else 'none')).strip()
    if normalized_premium_mode not in PREMIUM_MODES:
        raise IapAdminValidationError('Premium mode must be none, timed, or lifetime.')
    if not uses_premium:
        normalized_premium_mode, normalized_premium_duration_days = 'none', 0
    elif normalized_premium_mode == 'none' and normalized_premium_duration_days > 0:
        normalized_premium_mode = 'timed'
    if uses_premium and normalized_premium_mode == 'none':
        raise IapAdminValidationError('Premium pack functions require a premium duration in days.')
    if normalized_premium_mode == 'timed' and normalized_premium_duration_days <= 0:
        raise IapAdminValidationError('Premium duration days must be greater than 0.')
    if normalized_premium_mode == 'lifetime':
        normalized_premium_duration_days = 0
    driver = _require_driver()
    try:
        update_iap_pack_function_row(
            current_record['id'],
            {
                'pack_iap_id': _normalize_pack_id(pack_iap_id or current_record['packIapId'], 'packIapId'),
                'function_type': normalized_function_type,
                'credits': _normalize_credits(current_record['credits'] if credits is None else credits),
                'premium_mode': normalized_premium_mode,
                'premium_duration_days': normalized_premium_duration_days,
                'is_active': 1 if _normalize_bool(current_record['isActive'] if is_active is None else is_active) else 0,
                'updated_at': _now(),
            },
        )
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to update IAP pack function') from error
    return get_iap_pack_function(current_record['id'])

def delete_iap_pack_function(record_id):
    current_record = get_iap_pack_function(record_id)
    driver = _require_driver()
    try:
        delete_iap_pack_function_row(current_record['id'])
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to delete IAP pack function') from error
    return current_record

def list_iap_sales():
    ensure_iap_admin_schema()
    driver = _require_driver()
    try:
        return [_row_to_sale(row) for row in list_iap_sale_rows()]
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list IAP sales') from error

def create_iap_sale(name, pack_id, discount_percent=0, start_at=0, end_at=0, first_pack_purchase=False, first_iap_purchase=False, is_active=True):
    ensure_iap_admin_schema()
    normalized_start_at = _normalize_timestamp(start_at)
    normalized_end_at = _normalize_timestamp(end_at)
    if normalized_start_at and normalized_end_at and normalized_end_at < normalized_start_at:
        raise IapAdminValidationError('Sale end time must be after the start time.')
    driver = _require_driver()
    now = _now()
    try:
        sale_id = insert_iap_sale_row(
            _normalize_name(name, 'Sale name'),
            _normalize_pack_id(pack_id, 'packId'),
            str(_normalize_discount(discount_percent)),
            normalized_start_at,
            normalized_end_at,
            1 if _normalize_bool(first_pack_purchase, default=False) else 0,
            1 if _normalize_bool(first_iap_purchase, default=False) else 0,
            1 if _normalize_bool(is_active) else 0,
            now,
        )
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to create IAP sale') from error
    return get_iap_sale(sale_id)

def get_iap_sale(sale_id):
    ensure_iap_admin_schema()
    driver = _require_driver()
    try:
        row = get_iap_sale_row(sale_id)
        if not row:
            raise IapAdminNotFoundError('IAP sale not found')
        return _row_to_sale(row)
    except IapAdminNotFoundError:
        raise
    except (driver.MySQLError, ValueError) as error:
        raise AuthStoreError('Unable to load IAP sale') from error

def delete_iap_sale(sale_id):
    current_sale = get_iap_sale(sale_id)
    driver = _require_driver()
    try:
        delete_iap_sale_row(current_sale['id'])
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to delete IAP sale') from error
    return current_sale