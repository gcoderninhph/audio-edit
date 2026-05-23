import json
import os
import time

try:
    from repositories.auth_user_repository import (
        ensure_auth_column,
        ensure_auth_tables,
        get_auth_user_row_by_id,
        get_auth_user_row_by_identifier,
        insert_auth_user_row,
        insert_legacy_auth_user_if_missing,
    )
    from utils.mysql_connection import connect_mysql, load_mysql_settings, quote_mysql_identifier, require_mysql_driver
except ImportError:
    from ..repositories.auth_user_repository import (
        ensure_auth_column,
        ensure_auth_tables,
        get_auth_user_row_by_id,
        get_auth_user_row_by_identifier,
        insert_auth_user_row,
        insert_legacy_auth_user_if_missing,
    )
    from ..utils.mysql_connection import connect_mysql, load_mysql_settings, quote_mysql_identifier, require_mysql_driver

try:
    from utils.auth_user_record import (
        _normalize_is_locked,
        _normalize_is_premium,
        _normalize_role,
        _row_to_user_record,
        build_premium_state,
        normalize_premium_window,
    )
except ImportError:
    from ..utils.auth_user_record import (
        _normalize_is_locked,
        _normalize_is_premium,
        _normalize_role,
        _row_to_user_record,
        build_premium_state,
        normalize_premium_window,
    )

_MYSQL_SETTINGS = load_mysql_settings(['AUTH'])
MYSQL_HOST = _MYSQL_SETTINGS['host']
MYSQL_PORT = _MYSQL_SETTINGS['port']
MYSQL_USER = _MYSQL_SETTINGS['user']
MYSQL_PASSWORD = _MYSQL_SETTINGS['password']
MYSQL_DATABASE = _MYSQL_SETTINGS['database']
DEFAULT_INITIAL_CREDITS = int(os.environ.get('AUTH_INITIAL_CREDITS', '1000'))
DEFAULT_USER_ROLE = 'user'
ADMIN_USER_ROLE = 'admin'
LOCAL_AUTH_USER_ID = os.environ.get('AUTH_USER_ID', 'local-user')
LOCAL_AUTH_EMAIL = str(os.environ.get('AUTH_USERNAME', 'demo@local')).strip().lower()
LOCAL_AUTH_DISPLAY_NAME = os.environ.get('AUTH_DISPLAY_NAME', 'Local Editor')
LEGACY_AUTH_USER_STORE_PATH = os.environ.get(
    'AUTH_USER_STORE_PATH',
    os.path.join(os.path.dirname(__file__), 'uploads', 'auth-users.json')
)

_schema_ready = False


class AuthStoreError(RuntimeError):
    pass


class DuplicateUserError(AuthStoreError):
    pass


class InsufficientCreditsError(AuthStoreError):
    def __init__(self, available_credits, required_credits):
        super().__init__('Not enough credits')
        self.available_credits = max(0, int(available_credits or 0))
        self.required_credits = max(0, int(required_credits or 0))


def _require_driver():
    return require_mysql_driver(AuthStoreError)


def _quote_identifier(identifier):
    return quote_mysql_identifier(identifier, AuthStoreError)


def _connect(database=None):
    return connect_mysql(_MYSQL_SETTINGS, error_cls=AuthStoreError, database=database)


def _read_legacy_json_users():
    try:
        with open(LEGACY_AUTH_USER_STORE_PATH, 'r', encoding='utf-8') as user_file:
            payload = json.load(user_file)
    except FileNotFoundError:
        return []
    except (OSError, json.JSONDecodeError):
        return []

    users = payload.get('users') if isinstance(payload, dict) else payload
    return users if isinstance(users, list) else []


def _migrate_legacy_json_users():
    for user in _read_legacy_json_users():
        email = str(user.get('email') or '').strip().lower()
        if not email or not user.get('passwordHash') or not user.get('passwordSalt'):
            continue
        insert_legacy_auth_user_if_missing(
            {
                'id': user.get('id'),
                'email': email,
                'display_name': user.get('displayName') or email.split('@', 1)[0],
                'password_hash': user.get('passwordHash'),
                'password_salt': user.get('passwordSalt'),
                'password_iterations': int(user.get('passwordIterations') or 200000),
                'created_at': int(user.get('createdAt') or 0),
                'updated_at': int(user.get('createdAt') or 0),
            }
        )


def _ensure_column(cursor, table_name, column_name, definition):
    ensure_auth_column(cursor, table_name, column_name, definition, MYSQL_DATABASE)


def ensure_auth_schema():
    global _schema_ready
    if _schema_ready:
        return

    driver = _require_driver()
    try:
        ensure_auth_tables(
            DEFAULT_USER_ROLE,
            DEFAULT_INITIAL_CREDITS,
            LOCAL_AUTH_USER_ID,
            LOCAL_AUTH_EMAIL,
            LOCAL_AUTH_DISPLAY_NAME,
        )
        _migrate_legacy_json_users()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to initialize auth database schema') from error

    _schema_ready = True


def find_registered_user(email):
    ensure_auth_schema()
    driver = _require_driver()
    identifier = str(email or '').strip().lower()
    if not identifier:
        return None
    try:
        return _row_to_user_record(get_auth_user_row_by_identifier(identifier))
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to read auth user') from error


def find_user_by_id(user_id):
    ensure_auth_schema()
    driver = _require_driver()
    try:
        return _row_to_user_record(get_auth_user_row_by_id(user_id))
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to read auth user') from error


def create_registered_user(user_record):
    ensure_auth_schema()
    driver = _require_driver()
    normalized_role = _normalize_role(user_record.get('role'))
    normalized_is_locked = _normalize_is_locked(
        user_record['isLocked'] if 'isLocked' in user_record else user_record.get('is_locked')
    )
    normalized_premium_start_at, normalized_premium_end_at = normalize_premium_window(
        user_record['premiumStartAt'] if 'premiumStartAt' in user_record else user_record.get('premium_start_at'),
        user_record['premiumEndAt'] if 'premiumEndAt' in user_record else user_record.get('premium_end_at'),
        allow_empty=True,
    )
    premium_state = build_premium_state(
        normalized_premium_start_at,
        normalized_premium_end_at,
        legacy_is_premium=user_record['isPremium'] if 'isPremium' in user_record else user_record.get('is_premium'),
    )
    if normalized_role == ADMIN_USER_ROLE:
        normalized_is_locked = False
    try:
        insert_auth_user_row(
            {
                'id': user_record['id'],
                'email': user_record['email'],
                'username': user_record.get('username') or None,
                'display_name': user_record['displayName'],
                'role': normalized_role,
                'is_premium': 1 if premium_state['isPremium'] else 0,
                'premium_start_at': normalized_premium_start_at,
                'premium_end_at': normalized_premium_end_at,
                'is_locked': 1 if normalized_is_locked else 0,
                'credits': int(user_record.get('credits') or DEFAULT_INITIAL_CREDITS),
                'password_hash': user_record['passwordHash'],
                'password_salt': user_record['passwordSalt'],
                'password_iterations': int(user_record['passwordIterations']),
                'created_at': int(user_record['createdAt']),
                'updated_at': int(user_record['createdAt']),
            }
        )
    except driver.err.IntegrityError as error:
        raise DuplicateUserError('This email is already registered') from error
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to create auth user') from error


def update_user_credits(user_id, delta_credits, **kwargs):
    try:
        from services.auth_credit_store import update_user_credits as update_user_credits_impl
    except ImportError:
        from .auth_credit_store import update_user_credits as update_user_credits_impl

    return update_user_credits_impl(user_id, delta_credits, **kwargs)


def debit_user_credits(user_id, amount, **kwargs):
    try:
        from services.auth_credit_store import debit_user_credits as debit_user_credits_impl
    except ImportError:
        from .auth_credit_store import debit_user_credits as debit_user_credits_impl

    return debit_user_credits_impl(user_id, amount, **kwargs)


def refund_user_credits(user_id, amount, **kwargs):
    try:
        from services.auth_credit_store import refund_user_credits as refund_user_credits_impl
    except ImportError:
        from .auth_credit_store import refund_user_credits as refund_user_credits_impl

    return refund_user_credits_impl(user_id, amount, **kwargs)


try:
    from services.auth_refresh_store import (
        cleanup_refresh_tokens,
        get_refresh_token,
        revoke_refresh_token,
        revoke_refresh_tokens_for_user,
        store_refresh_token,
    )
except ImportError:
    from .auth_refresh_store import (
        cleanup_refresh_tokens,
        get_refresh_token,
        revoke_refresh_token,
        revoke_refresh_tokens_for_user,
        store_refresh_token,
    )