try:
    from repositories.admin_user_repository import (
        count_admin_accounts,
        get_auth_user_summary_row,
        list_auth_user_rows_page,
        update_auth_user_lock,
        update_auth_user_premium_window,
        update_auth_user_role,
    )
    from services.auth_credit_store import set_user_credit_balance
    from services.auth_store import (
        ADMIN_USER_ROLE,
        DEFAULT_USER_ROLE,
        AuthStoreError,
        _require_driver,
        ensure_auth_schema,
        find_user_by_id,
        revoke_refresh_tokens_for_user,
    )
    from utils.pagination import build_pagination, normalize_page, normalize_page_size
    from utils.auth_user_record import (
        PremiumWindowValidationError,
        _normalize_is_locked,
        _normalize_is_premium,
        _normalize_role,
        _row_to_user_record,
        is_premium_active,
        normalize_premium_window,
    )
except ImportError:
    from ..repositories.admin_user_repository import (
        count_admin_accounts,
        get_auth_user_summary_row,
        list_auth_user_rows_page,
        update_auth_user_lock,
        update_auth_user_premium_window,
        update_auth_user_role,
    )
    from .auth_credit_store import set_user_credit_balance
    from .auth_store import (
        ADMIN_USER_ROLE,
        DEFAULT_USER_ROLE,
        AuthStoreError,
        _require_driver,
        ensure_auth_schema,
        find_user_by_id,
        revoke_refresh_tokens_for_user,
    )
    from ..utils.pagination import build_pagination, normalize_page, normalize_page_size
    from ..utils.auth_user_record import (
        PremiumWindowValidationError,
        _normalize_is_locked,
        _normalize_is_premium,
        _normalize_role,
        _row_to_user_record,
        is_premium_active,
        normalize_premium_window,
    )


class UserNotFoundError(AuthStoreError):
    pass


class LastAdminRemovalError(AuthStoreError):
    pass


class AdminAccountLockError(AuthStoreError):
    pass



def _normalize_limit(value, default=50, minimum=1, maximum=200):
    safe_value = int(value or default)
    return max(minimum, min(maximum, safe_value))



def _normalize_search_term(value):
    return ' '.join(str(value or '').strip().split())


def has_admin_account():
    ensure_auth_schema()
    driver = _require_driver()
    try:
        return count_admin_accounts() > 0
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to read admin accounts') from error



def list_auth_users(limit=200):
    return list_auth_users_page(page=1, page_size=limit)['users']


def list_auth_users_page(page=1, page_size=10, search_term=''):
    ensure_auth_schema()
    driver = _require_driver()
    safe_page = normalize_page(page)
    safe_page_size = normalize_page_size(page_size, default=10, maximum=100)
    safe_search_term = _normalize_search_term(search_term)
    try:
        result = list_auth_user_rows_page(safe_page_size, (safe_page - 1) * safe_page_size, safe_search_term)
        pagination = build_pagination(safe_page, safe_page_size, result.get('totalItems') or 0)
        return {
            'users': [_row_to_user_record(row) for row in result.get('rows') or []],
            'pagination': pagination,
            'search': result.get('search') or safe_search_term,
        }
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list auth users') from error


def get_auth_user(user_id):
    user_record = find_user_by_id(user_id)
    if not user_record:
        raise UserNotFoundError('Auth user not found')
    return user_record



def get_auth_user_summary():
    ensure_auth_schema()
    driver = _require_driver()
    try:
        row = get_auth_user_summary_row()
        return {
            'adminUsers': int(row.get('admin_users') or 0),
            'standardUsers': int(row.get('standard_users') or 0),
            'totalCredits': int(row.get('total_credits') or 0),
            'totalUsers': int(row.get('total_users') or 0),
        }
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to summarize auth users') from error



def update_auth_user_admin_fields(
    user_id,
    role=None,
    credits=None,
    is_premium=None,
    premium_start_at=None,
    premium_end_at=None,
    is_locked=None,
    actor_user_id=None,
):
    ensure_auth_schema()
    driver = _require_driver()
    next_role = _normalize_role(role) if role is not None else None
    next_credits = max(0, int(credits or 0)) if credits is not None else None
    next_is_premium = _normalize_is_premium(is_premium) if is_premium is not None else None
    next_is_locked = _normalize_is_locked(is_locked) if is_locked is not None else None
    has_premium_start_at = premium_start_at is not None
    has_premium_end_at = premium_end_at is not None

    if next_role is None and next_credits is None and next_is_premium is None and next_is_locked is None and not has_premium_start_at and not has_premium_end_at:
        raise AuthStoreError('No admin fields were provided to update')

    try:
        current_user = get_auth_user(user_id)
        final_role = next_role if next_role is not None else current_user.get('role')
        final_is_locked = next_is_locked if next_is_locked is not None else bool(current_user.get('isLocked'))
        current_premium_start_at = int(current_user.get('premiumStartAt') or 0)
        current_premium_end_at = int(current_user.get('premiumEndAt') or 0)

        if has_premium_start_at != has_premium_end_at:
            raise PremiumWindowValidationError('Premium start and end time must both be provided.')

        if has_premium_start_at and has_premium_end_at:
            next_premium_start_at, next_premium_end_at = normalize_premium_window(premium_start_at, premium_end_at, allow_empty=True)
        elif next_is_premium is False:
            next_premium_start_at, next_premium_end_at = 0, 0
        elif next_is_premium is True:
            raise PremiumWindowValidationError('Premium now requires both a start and end time.')
        else:
            next_premium_start_at, next_premium_end_at = current_premium_start_at, current_premium_end_at

        if final_role == ADMIN_USER_ROLE and final_is_locked:
            raise AdminAccountLockError('Admin accounts cannot be locked')

        if current_user.get('role') == ADMIN_USER_ROLE and next_role == DEFAULT_USER_ROLE:
            if count_admin_accounts() <= 1:
                raise LastAdminRemovalError('At least one admin account is required')

        if next_role is not None and next_role != current_user.get('role'):
            update_auth_user_role(user_id, next_role)

        if next_credits is not None and next_credits != int(current_user.get('credits') or 0):
            set_user_credit_balance(
                user_id,
                next_credits,
                actor_user_id=actor_user_id,
                note='Admin updated credit balance',
                details={'source': 'admin-users'},
            )

        if next_premium_start_at != current_premium_start_at or next_premium_end_at != current_premium_end_at:
            update_auth_user_premium_window(
                user_id,
                next_premium_start_at,
                next_premium_end_at,
                is_premium_active(next_premium_start_at, next_premium_end_at),
            )

        if next_is_locked is not None and next_is_locked != bool(current_user.get('isLocked')):
            update_auth_user_lock(user_id, next_is_locked)

            if next_is_locked:
                revoke_refresh_tokens_for_user(user_id)

        return get_auth_user(user_id)
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to update auth user') from error
