try:
    from repositories.auth_refresh_repository import (
        delete_expired_refresh_tokens,
        delete_refresh_token,
        delete_refresh_tokens_for_user as delete_refresh_tokens_for_user_rows,
        get_refresh_token_row,
        upsert_refresh_token,
    )
    from services.auth_store import AuthStoreError, _require_driver, ensure_auth_schema
except ImportError:
    from ..repositories.auth_refresh_repository import (
        delete_expired_refresh_tokens,
        delete_refresh_token,
        delete_refresh_tokens_for_user as delete_refresh_tokens_for_user_rows,
        get_refresh_token_row,
        upsert_refresh_token,
    )
    from .auth_store import AuthStoreError, _require_driver, ensure_auth_schema


def cleanup_refresh_tokens(now):
    ensure_auth_schema()
    driver = _require_driver()
    try:
        delete_expired_refresh_tokens(now)
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to clean refresh tokens') from error


def store_refresh_token(token_id, user_id, expires_at, created_at):
    ensure_auth_schema()
    driver = _require_driver()
    try:
        upsert_refresh_token(token_id, user_id, expires_at, created_at)
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to store refresh token') from error


def get_refresh_token(token_id, now):
    ensure_auth_schema()
    driver = _require_driver()
    try:
        row = get_refresh_token_row(token_id)
        if not row:
            return None
        if int(row['expires_at']) <= int(now):
            delete_refresh_token(token_id)
            return None
        return {
            'tokenId': row['token_id'],
            'userId': row['user_id'],
            'expiresAt': int(row['expires_at']),
        }
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to read refresh token') from error


def revoke_refresh_token(token_id):
    if not token_id:
        return

    ensure_auth_schema()
    driver = _require_driver()
    try:
        delete_refresh_token(token_id)
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to revoke refresh token') from error


def revoke_refresh_tokens_for_user(user_id):
    if not user_id:
        return

    ensure_auth_schema()
    driver = _require_driver()
    try:
        delete_refresh_tokens_for_user_rows(user_id)
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to revoke refresh tokens for user') from error