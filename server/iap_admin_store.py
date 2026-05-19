import time
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

try:
    from auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _require_driver, ensure_auth_schema
except ImportError:
    from .auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _require_driver, ensure_auth_schema


MAX_IAP_ADMIN_NAME_LENGTH = 120
MAX_PACK_ID_LENGTH = 80
PACK_FUNCTION_TYPES = {'addCredits', 'unlockPremium', 'creditsAndPremium'}
PREMIUM_MODES = {'none', 'lifetime'}

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
                        is_active TINYINT(1) NOT NULL DEFAULT 1,
                        created_at BIGINT NOT NULL,
                        updated_at BIGINT NOT NULL,
                        INDEX idx_iap_pack_functions_pack (pack_iap_id),
                        INDEX idx_iap_pack_functions_active (is_active)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    """
                )
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
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to initialize IAP admin schema') from error

    _schema_ready = True


def list_iap_pack_functions():
    ensure_iap_admin_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM iap_pack_functions ORDER BY is_active DESC, updated_at DESC')
                return [_row_to_pack_function(row) for row in cursor.fetchall() or []]
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list IAP pack functions') from error


def create_iap_pack_function(pack_iap_id, function_type, credits=0, premium_mode='none', is_active=True):
    ensure_iap_admin_schema()
    normalized_function_type = str(function_type or '').strip()
    normalized_premium_mode = str(premium_mode or 'none').strip()
    if normalized_function_type not in PACK_FUNCTION_TYPES:
        raise IapAdminValidationError('Pack function must be addCredits, unlockPremium, or creditsAndPremium.')
    if normalized_premium_mode not in PREMIUM_MODES:
        raise IapAdminValidationError('Premium mode must be none or lifetime.')
    driver = _require_driver()
    now = _now()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO iap_pack_functions
                        (pack_iap_id, function_type, credits, premium_mode, is_active, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (_normalize_pack_id(pack_iap_id, 'packIapId'), normalized_function_type, _normalize_credits(credits), normalized_premium_mode, 1 if _normalize_bool(is_active) else 0, now, now),
                )
                record_id = cursor.lastrowid
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to create IAP pack function') from error
    return get_iap_pack_function(record_id)


def get_iap_pack_function(record_id):
    ensure_iap_admin_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM iap_pack_functions WHERE id = %s LIMIT 1', (int(record_id),))
                row = cursor.fetchone()
                if not row:
                    raise IapAdminNotFoundError('IAP pack function not found')
                return _row_to_pack_function(row)
        finally:
            connection.close()
    except IapAdminNotFoundError:
        raise
    except (driver.MySQLError, ValueError) as error:
        raise AuthStoreError('Unable to load IAP pack function') from error


def delete_iap_pack_function(record_id):
    current_record = get_iap_pack_function(record_id)
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('DELETE FROM iap_pack_functions WHERE id = %s', (current_record['id'],))
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to delete IAP pack function') from error
    return current_record


def list_iap_sales():
    ensure_iap_admin_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM iap_sales ORDER BY is_active DESC, updated_at DESC')
                return [_row_to_sale(row) for row in cursor.fetchall() or []]
        finally:
            connection.close()
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
                        _normalize_name(name, 'Sale name'),
                        _normalize_pack_id(pack_id, 'packId'),
                        str(_normalize_discount(discount_percent)),
                        normalized_start_at,
                        normalized_end_at,
                        1 if _normalize_bool(first_pack_purchase, default=False) else 0,
                        1 if _normalize_bool(first_iap_purchase, default=False) else 0,
                        1 if _normalize_bool(is_active) else 0,
                        now,
                        now,
                    ),
                )
                sale_id = cursor.lastrowid
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to create IAP sale') from error
    return get_iap_sale(sale_id)


def get_iap_sale(sale_id):
    ensure_iap_admin_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM iap_sales WHERE id = %s LIMIT 1', (int(sale_id),))
                row = cursor.fetchone()
                if not row:
                    raise IapAdminNotFoundError('IAP sale not found')
                return _row_to_sale(row)
        finally:
            connection.close()
    except IapAdminNotFoundError:
        raise
    except (driver.MySQLError, ValueError) as error:
        raise AuthStoreError('Unable to load IAP sale') from error


def delete_iap_sale(sale_id):
    current_sale = get_iap_sale(sale_id)
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('DELETE FROM iap_sales WHERE id = %s', (current_sale['id'],))
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to delete IAP sale') from error
    return current_sale