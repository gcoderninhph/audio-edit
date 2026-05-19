try:
    from auth_store import MYSQL_DATABASE, AuthStoreError, _connect, _require_driver, ensure_auth_schema
except ImportError:
    from .auth_store import MYSQL_DATABASE, AuthStoreError, _connect, _require_driver, ensure_auth_schema


def cleanup_refresh_tokens(now):
    ensure_auth_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('DELETE FROM auth_refresh_tokens WHERE expires_at <= %s', (int(now),))
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to clean refresh tokens') from error


def store_refresh_token(token_id, user_id, expires_at, created_at):
    ensure_auth_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO auth_refresh_tokens (token_id, user_id, expires_at, created_at)
                    VALUES (%s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), expires_at = VALUES(expires_at)
                    """,
                    (token_id, user_id, int(expires_at), int(created_at)),
                )
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to store refresh token') from error


def get_refresh_token(token_id, now):
    ensure_auth_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM auth_refresh_tokens WHERE token_id = %s LIMIT 1', (token_id,))
                row = cursor.fetchone()
                if not row:
                    return None
                if int(row['expires_at']) <= int(now):
                    cursor.execute('DELETE FROM auth_refresh_tokens WHERE token_id = %s', (token_id,))
                    return None
                return {
                    'tokenId': row['token_id'],
                    'userId': row['user_id'],
                    'expiresAt': int(row['expires_at']),
                }
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to read refresh token') from error


def revoke_refresh_token(token_id):
    if not token_id:
        return

    ensure_auth_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('DELETE FROM auth_refresh_tokens WHERE token_id = %s', (token_id,))
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to revoke refresh token') from error


def revoke_refresh_tokens_for_user(user_id):
    if not user_id:
        return

    ensure_auth_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('DELETE FROM auth_refresh_tokens WHERE user_id = %s', (user_id,))
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to revoke refresh tokens for user') from error