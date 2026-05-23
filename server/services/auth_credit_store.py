import json
import time

try:
    from repositories.auth_credit_repository import apply_credit_delta, create_credit_history_table, get_credit_history_page_rows
    from utils.pagination import build_pagination, normalize_pagination
    from services.auth_store import (
        AuthStoreError,
        InsufficientCreditsError,
        _require_driver,
        _row_to_user_record,
        ensure_auth_schema,
        find_user_by_id,
    )
except ImportError:
    from ..repositories.auth_credit_repository import apply_credit_delta, create_credit_history_table, get_credit_history_page_rows
    from ..utils.pagination import build_pagination, normalize_pagination
    from .auth_store import (
        AuthStoreError,
        InsufficientCreditsError,
        _require_driver,
        _row_to_user_record,
        ensure_auth_schema,
        find_user_by_id,
    )


_credit_history_schema_ready = False


def _row_to_credit_event(row):
    if not row:
        return None

    details_json = row.get('details_json')
    try:
        details = json.loads(details_json) if details_json else {}
    except json.JSONDecodeError:
        details = {}

    return {
        'id': int(row.get('id') or 0),
        'userId': row.get('user_id') or '',
        'actorUserId': row.get('actor_user_id') or '',
        'changeType': row.get('change_type') or 'adjustment',
        'deltaCredits': int(row.get('delta_credits') or 0),
        'balanceAfter': max(0, int(row.get('balance_after') or 0)),
        'note': row.get('note') or '',
        'details': details,
        'createdAt': int(row.get('created_at') or 0),
    }


def ensure_credit_history_schema():
    global _credit_history_schema_ready
    if _credit_history_schema_ready:
        return

    ensure_auth_schema()
    driver = _require_driver()
    try:
        create_credit_history_table()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to initialize auth credit history schema') from error

    _credit_history_schema_ready = True


def update_user_credits(user_id, delta_credits, *, change_type='adjustment', actor_user_id=None, note=None, details=None):
    ensure_credit_history_schema()
    driver = _require_driver()
    safe_delta = int(delta_credits or 0)
    if safe_delta == 0:
        return find_user_by_id(user_id)

    now = int(time.time())
    try:
        result = apply_credit_delta(
            user_id,
            safe_delta,
            actor_user_id=actor_user_id,
            change_type=change_type,
            note=note,
            details=details,
            created_at=now,
        )
        if result.get('status') == 'missing':
            raise AuthStoreError('Auth user not found')
        if result.get('status') == 'insufficient':
            raise InsufficientCreditsError(result.get('availableCredits') or 0, result.get('requiredCredits') or 0)
        updated_user = _row_to_user_record(result.get('userRow'))
        if not updated_user:
            raise AuthStoreError('Auth user not found')
        return updated_user
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to update auth credits') from error


def set_user_credit_balance(user_id, target_credits, *, actor_user_id=None, note=None, details=None):
    current_user = find_user_by_id(user_id)
    if not current_user:
        raise AuthStoreError('Auth user not found')

    safe_target_credits = max(0, int(target_credits or 0))
    safe_delta = safe_target_credits - int(current_user.get('credits') or 0)
    if safe_delta == 0:
        return current_user

    change_type = 'admin_grant' if safe_delta > 0 else 'admin_adjustment'
    return update_user_credits(
        user_id,
        safe_delta,
        change_type=change_type,
        actor_user_id=actor_user_id,
        note=note,
        details=details,
    )


def add_user_credits(user_id, amount, *, actor_user_id=None, note=None, details=None):
    safe_amount = abs(int(amount or 0))
    return update_user_credits(
        user_id,
        safe_amount,
        change_type='admin_grant',
        actor_user_id=actor_user_id,
        note=note,
        details=details,
    )


def debit_user_credits(user_id, amount, *, change_type='debit', actor_user_id=None, note=None, details=None):
    return update_user_credits(
        user_id,
        -abs(int(amount or 0)),
        change_type=change_type,
        actor_user_id=actor_user_id,
        note=note,
        details=details,
    )


def refund_user_credits(user_id, amount, *, change_type='refund', actor_user_id=None, note=None, details=None):
    return update_user_credits(
        user_id,
        abs(int(amount or 0)),
        change_type=change_type,
        actor_user_id=actor_user_id,
        note=note,
        details=details,
    )


def list_user_credit_history_page(user_id, page=1, page_size=10):
    ensure_credit_history_schema()
    driver = _require_driver()
    safe_page, safe_page_size = normalize_pagination(page, page_size, default_page_size=10, max_page_size=100)
    offset = (safe_page - 1) * safe_page_size
    try:
        result = get_credit_history_page_rows(user_id, safe_page_size, offset)
        pagination = build_pagination(safe_page, safe_page_size, result.get('totalItems') or 0)
        return {
            'history': [_row_to_credit_event(row) for row in result.get('rows') or []],
            'pagination': pagination,
        }
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to read auth credit history') from error