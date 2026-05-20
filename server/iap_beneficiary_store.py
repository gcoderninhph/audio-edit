import time

try:
    from auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _require_driver, ensure_auth_schema
except ImportError:
    from .auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _require_driver, ensure_auth_schema


MAX_ACCOUNT_NAME_LENGTH = 120
MAX_BANK_ID_LENGTH = 40
MAX_BANK_ACCOUNT_LENGTH = 80
_schema_ready = False


class IapBeneficiaryNotFoundError(AuthStoreError):
    pass


class IapBeneficiaryValidationError(ValueError):
    pass


def _now():
    return int(time.time())


def _normalize_text(value, field_name, min_length=1, max_length=120):
    normalized_value = ' '.join(str(value or '').strip().split())
    if len(normalized_value) < min_length or len(normalized_value) > max_length:
        raise IapBeneficiaryValidationError(f'{field_name} must be between {min_length} and {max_length} characters.')
    return normalized_value


def _normalize_bool(value, default=False):
    if value is None:
        return bool(default)
    if isinstance(value, bool):
        return value
    return str(value or '').strip().lower() in {'1', 'true', 'yes', 'on'}


def _row_to_beneficiary(row):
    if not row:
        return None
    return {
        'id': int(row.get('id') or 0),
        'name': row.get('name') or '',
        'bankId': row.get('bank_id') or '',
        'bankAccount': row.get('bank_account') or '',
        'isCurrent': bool(row.get('is_current') or 0),
        'createdAt': int(row.get('created_at') or 0),
        'updatedAt': int(row.get('updated_at') or 0),
    }


def ensure_iap_beneficiary_schema():
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
                    CREATE TABLE IF NOT EXISTS iap_beneficiary_accounts (
                        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(120) NOT NULL,
                        bank_id VARCHAR(40) NOT NULL,
                        bank_account VARCHAR(80) NOT NULL,
                        is_current TINYINT(1) NOT NULL DEFAULT 0,
                        created_at BIGINT NOT NULL,
                        updated_at BIGINT NOT NULL,
                        INDEX idx_iap_beneficiary_current (is_current),
                        INDEX idx_iap_beneficiary_bank_account (bank_account)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    """
                )
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to initialize IAP beneficiary account schema') from error

    _schema_ready = True


def list_iap_beneficiary_accounts():
    ensure_iap_beneficiary_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM iap_beneficiary_accounts ORDER BY is_current DESC, updated_at DESC, id DESC')
                return [_row_to_beneficiary(row) for row in cursor.fetchall() or []]
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list IAP beneficiary accounts') from error


def get_iap_beneficiary_account(account_id):
    ensure_iap_beneficiary_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM iap_beneficiary_accounts WHERE id = %s LIMIT 1', (int(account_id),))
                account = _row_to_beneficiary(cursor.fetchone())
                if not account:
                    raise IapBeneficiaryNotFoundError('IAP beneficiary account not found')
                return account
        finally:
            connection.close()
    except IapBeneficiaryNotFoundError:
        raise
    except (driver.MySQLError, ValueError) as error:
        raise AuthStoreError('Unable to load IAP beneficiary account') from error


def get_current_iap_beneficiary_account():
    ensure_iap_beneficiary_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM iap_beneficiary_accounts WHERE is_current = 1 ORDER BY updated_at DESC, id DESC LIMIT 1')
                account = _row_to_beneficiary(cursor.fetchone())
                if not account:
                    raise IapBeneficiaryNotFoundError('No current IAP beneficiary account is configured')
                return account
        finally:
            connection.close()
    except IapBeneficiaryNotFoundError:
        raise
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to load current IAP beneficiary account') from error


def create_iap_beneficiary_account(name, bank_id, bank_account, is_current=False):
    ensure_iap_beneficiary_schema()
    driver = _require_driver()
    normalized_name = _normalize_text(name, 'Beneficiary name', max_length=MAX_ACCOUNT_NAME_LENGTH)
    normalized_bank_id = _normalize_text(bank_id, 'Bank id', max_length=MAX_BANK_ID_LENGTH)
    normalized_bank_account = _normalize_text(bank_account, 'Bank account', max_length=MAX_BANK_ACCOUNT_LENGTH)
    now = _now()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT COUNT(*) AS total_accounts FROM iap_beneficiary_accounts')
                is_first_account = int((cursor.fetchone() or {}).get('total_accounts') or 0) == 0
                next_is_current = _normalize_bool(is_current) or is_first_account
                if next_is_current:
                    cursor.execute('UPDATE iap_beneficiary_accounts SET is_current = 0, updated_at = %s', (now,))
                cursor.execute(
                    """
                    INSERT INTO iap_beneficiary_accounts (name, bank_id, bank_account, is_current, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (normalized_name, normalized_bank_id, normalized_bank_account, 1 if next_is_current else 0, now, now),
                )
                account_id = cursor.lastrowid
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to create IAP beneficiary account') from error
    return get_iap_beneficiary_account(account_id)


def update_iap_beneficiary_account(account_id, name=None, bank_id=None, bank_account=None, is_current=None):
    current_account = get_iap_beneficiary_account(account_id)
    next_name = current_account['name'] if name is None else _normalize_text(name, 'Beneficiary name', max_length=MAX_ACCOUNT_NAME_LENGTH)
    next_bank_id = current_account['bankId'] if bank_id is None else _normalize_text(bank_id, 'Bank id', max_length=MAX_BANK_ID_LENGTH)
    next_bank_account = current_account['bankAccount'] if bank_account is None else _normalize_text(bank_account, 'Bank account', max_length=MAX_BANK_ACCOUNT_LENGTH)
    next_is_current = current_account['isCurrent'] if is_current is None else _normalize_bool(is_current)
    now = _now()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                if next_is_current:
                    cursor.execute('UPDATE iap_beneficiary_accounts SET is_current = 0, updated_at = %s', (now,))
                cursor.execute(
                    'UPDATE iap_beneficiary_accounts SET name = %s, bank_id = %s, bank_account = %s, is_current = %s, updated_at = %s WHERE id = %s',
                    (next_name, next_bank_id, next_bank_account, 1 if next_is_current else 0, now, current_account['id']),
                )
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to update IAP beneficiary account') from error
    return get_iap_beneficiary_account(current_account['id'])


def delete_iap_beneficiary_account(account_id):
    current_account = get_iap_beneficiary_account(account_id)
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('DELETE FROM iap_beneficiary_accounts WHERE id = %s', (current_account['id'],))
                if current_account['isCurrent']:
                    cursor.execute('SELECT id FROM iap_beneficiary_accounts ORDER BY updated_at DESC, id DESC LIMIT 1')
                    fallback_row = cursor.fetchone()
                    if fallback_row:
                        cursor.execute('UPDATE iap_beneficiary_accounts SET is_current = 1, updated_at = %s WHERE id = %s', (_now(), fallback_row['id']))
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to delete IAP beneficiary account') from error
    return current_account
