import logging
import os
import secrets

try:
    from services.admin_store import has_admin_account
    from services.auth_store import ADMIN_USER_ROLE, AuthStoreError
except ImportError:
    from .admin_store import has_admin_account
    from .auth_store import ADMIN_USER_ROLE, AuthStoreError


BOOTSTRAP_ADMIN_ID = 'bootstrap-admin'
BOOTSTRAP_ADMIN_USERNAME = str(os.environ.get('BOOTSTRAP_ADMIN_USERNAME', 'bootstrap-admin')).strip().lower() or 'bootstrap-admin'
BOOTSTRAP_ADMIN_DISPLAY_NAME = 'Temporary Admin'
BOOTSTRAP_ADMIN_EMAIL = f'{BOOTSTRAP_ADMIN_USERNAME}@bootstrap.local'
_bootstrap_state = None
logger = logging.getLogger(__name__)



def _build_bootstrap_user(password):
    return {
        'id': BOOTSTRAP_ADMIN_ID,
        'credits': 0,
        'email': BOOTSTRAP_ADMIN_EMAIL,
        'role': ADMIN_USER_ROLE,
        'username': BOOTSTRAP_ADMIN_USERNAME,
        'displayName': BOOTSTRAP_ADMIN_DISPLAY_NAME,
        'isTemporaryAdmin': True,
        'mustSetupAdmin': True,
        'temporaryAdminPassword': password,
    }



def clear_temporary_admin_state():
    global _bootstrap_state
    _bootstrap_state = None



def ensure_temporary_admin_account():
    global _bootstrap_state
    if has_admin_account():
        logger.info('[admin-bootstrap] Persisted admin account detected; temporary bootstrap admin is disabled.')
        clear_temporary_admin_state()
        return None

    if _bootstrap_state:
        return _bootstrap_state

    password = secrets.token_urlsafe(12)
    _bootstrap_state = _build_bootstrap_user(password)
    logger.warning('[admin-bootstrap] No persisted admin account found.')
    logger.warning('[admin-bootstrap] Temporary admin username: %s', BOOTSTRAP_ADMIN_USERNAME)
    logger.warning('[admin-bootstrap] Temporary admin password: %s', password)
    logger.warning('[admin-bootstrap] Login once with the temporary admin and complete the required admin setup form.')
    return _bootstrap_state



def announce_temporary_admin_account():
    try:
        ensure_temporary_admin_account()
    except AuthStoreError as error:
        logger.error('[admin-bootstrap] Unable to initialize temporary admin account: %s', error)



def get_temporary_admin_user(identifier, password):
    bootstrap_state = ensure_temporary_admin_account()
    if not bootstrap_state:
        return None

    normalized_identifier = str(identifier or '').strip().lower()
    if normalized_identifier not in {BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_EMAIL}:
        return None
    if str(password or '') != bootstrap_state.get('temporaryAdminPassword'):
        return None

    return {
        key: value
        for key, value in bootstrap_state.items()
        if key != 'temporaryAdminPassword'
    }



def is_temporary_admin_claims(claims):
    return bool(claims and (claims.get('isTemporaryAdmin') or claims.get('sub') == BOOTSTRAP_ADMIN_ID))
