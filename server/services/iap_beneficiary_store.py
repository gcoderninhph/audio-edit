import time

try:
    from services.auth_store import AuthStoreError, _require_driver, ensure_auth_schema
    from repositories.iap_beneficiary_repository import (
        clear_iap_beneficiary_current,
        count_iap_beneficiary_accounts,
        delete_iap_beneficiary_row,
        ensure_iap_beneficiary_table,
        get_iap_beneficiary_row,
        get_latest_iap_beneficiary_id,
        insert_iap_beneficiary_row,
        list_iap_beneficiary_rows,
        set_iap_beneficiary_current,
        update_iap_beneficiary_row,
    )
except ImportError:
    from .auth_store import AuthStoreError, _require_driver, ensure_auth_schema
    from ..repositories.iap_beneficiary_repository import (
        clear_iap_beneficiary_current,
        count_iap_beneficiary_accounts,
        delete_iap_beneficiary_row,
        ensure_iap_beneficiary_table,
        get_iap_beneficiary_row,
        get_latest_iap_beneficiary_id,
        insert_iap_beneficiary_row,
        list_iap_beneficiary_rows,
        set_iap_beneficiary_current,
        update_iap_beneficiary_row,
    )


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
        ensure_iap_beneficiary_table()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to initialize IAP beneficiary account schema') from error

    _schema_ready = True


def list_iap_beneficiary_accounts():
    ensure_iap_beneficiary_schema()
    driver = _require_driver()
    try:
        return [_row_to_beneficiary(row) for row in list_iap_beneficiary_rows()]
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list IAP beneficiary accounts') from error


def get_iap_beneficiary_account(account_id):
    ensure_iap_beneficiary_schema()
    driver = _require_driver()
    try:
        account = _row_to_beneficiary(get_iap_beneficiary_row(account_id))
        if not account:
            raise IapBeneficiaryNotFoundError('IAP beneficiary account not found')
        return account
    except IapBeneficiaryNotFoundError:
        raise
    except (driver.MySQLError, ValueError) as error:
        raise AuthStoreError('Unable to load IAP beneficiary account') from error


def get_current_iap_beneficiary_account():
    ensure_iap_beneficiary_schema()
    driver = _require_driver()
    try:
        for account in list_iap_beneficiary_accounts():
            if account['isCurrent']:
                return account
        raise IapBeneficiaryNotFoundError('No current IAP beneficiary account is configured')
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
        is_first_account = count_iap_beneficiary_accounts() == 0
        next_is_current = _normalize_bool(is_current) or is_first_account
        if next_is_current:
            clear_iap_beneficiary_current(now)
        account_id = insert_iap_beneficiary_row(
            normalized_name,
            normalized_bank_id,
            normalized_bank_account,
            next_is_current,
            now,
        )
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
        if next_is_current:
            clear_iap_beneficiary_current(now)
        update_iap_beneficiary_row(
            current_account['id'],
            next_name,
            next_bank_id,
            next_bank_account,
            next_is_current,
            now,
        )
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to update IAP beneficiary account') from error
    return get_iap_beneficiary_account(current_account['id'])


def delete_iap_beneficiary_account(account_id):
    current_account = get_iap_beneficiary_account(account_id)
    driver = _require_driver()
    try:
        delete_iap_beneficiary_row(current_account['id'])
        if current_account['isCurrent']:
            fallback_id = get_latest_iap_beneficiary_id()
            if fallback_id:
                set_iap_beneficiary_current(fallback_id, _now())
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to delete IAP beneficiary account') from error
    return current_account
