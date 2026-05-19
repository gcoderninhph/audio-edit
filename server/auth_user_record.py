import time


ADMIN_USER_ROLE = 'admin'
DEFAULT_USER_ROLE = 'user'


class PremiumWindowValidationError(ValueError):
    pass


def _normalize_role(value):
    return ADMIN_USER_ROLE if str(value or '').strip().lower() == ADMIN_USER_ROLE else DEFAULT_USER_ROLE


def _normalize_is_premium(value):
    if isinstance(value, bool):
        return value
    return str(value or '').strip().lower() in {'1', 'true', 'yes', 'on'}


def _normalize_is_locked(value):
    if isinstance(value, bool):
        return value
    return str(value or '').strip().lower() in {'1', 'true', 'yes', 'on'}


def _normalize_premium_timestamp(value, field_name):
    if value in (None, '', 0, '0'):
        return 0
    try:
        normalized_value = int(value)
    except (TypeError, ValueError) as error:
        raise PremiumWindowValidationError(f'{field_name} must be a unix timestamp in seconds.') from error
    if normalized_value < 0:
        raise PremiumWindowValidationError(f'{field_name} cannot be negative.')
    return normalized_value


def normalize_premium_window(start_at=None, end_at=None, allow_empty=True):
    normalized_start_at = _normalize_premium_timestamp(start_at, 'Premium start time')
    normalized_end_at = _normalize_premium_timestamp(end_at, 'Premium end time')
    if not normalized_start_at and not normalized_end_at:
        if allow_empty:
            return 0, 0
        raise PremiumWindowValidationError('Premium start and end time are required.')
    if not normalized_start_at or not normalized_end_at:
        raise PremiumWindowValidationError('Premium start and end time must both be provided.')
    if normalized_end_at <= normalized_start_at:
        raise PremiumWindowValidationError('Premium end time must be after the start time.')
    return normalized_start_at, normalized_end_at


def is_premium_active(start_at=None, end_at=None, now=None):
    normalized_start_at, normalized_end_at = normalize_premium_window(start_at, end_at, allow_empty=True)
    current_time = int(time.time()) if now is None else int(now)
    return bool(normalized_start_at and normalized_end_at and normalized_start_at <= current_time < normalized_end_at)


def build_premium_state(start_at=None, end_at=None, legacy_is_premium=False, now=None):
    normalized_start_at, normalized_end_at = normalize_premium_window(start_at, end_at, allow_empty=True)
    premium_is_active = is_premium_active(normalized_start_at, normalized_end_at, now=now)
    if not normalized_start_at and not normalized_end_at and _normalize_is_premium(legacy_is_premium):
        premium_is_active = True
    return {
        'isPremium': premium_is_active,
        'premiumStartAt': normalized_start_at,
        'premiumEndAt': normalized_end_at,
    }


def _row_to_user_record(row):
    if not row:
        return None
    premium_state = build_premium_state(
        row.get('premium_start_at'),
        row.get('premium_end_at'),
        legacy_is_premium=row.get('is_premium'),
    )
    return {
        'id': row['id'],
        'credits': max(0, int(row.get('credits') or 0)),
        'email': row['email'],
        'isLocked': _normalize_is_locked(row.get('is_locked')),
        'isPremium': premium_state['isPremium'],
        'premiumStartAt': premium_state['premiumStartAt'],
        'premiumEndAt': premium_state['premiumEndAt'],
        'role': _normalize_role(row.get('role')),
        'username': str(row.get('username') or '').strip(),
        'displayName': row.get('display_name') or row['email'].split('@', 1)[0],
        'passwordHash': row.get('password_hash') or '',
        'passwordSalt': row.get('password_salt') or '',
        'passwordIterations': row.get('password_iterations') or 0,
        'createdAt': row.get('created_at') or 0,
        'updatedAt': row.get('updated_at') or 0,
    }