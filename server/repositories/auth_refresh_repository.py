try:
    from services.auth_store import MYSQL_DATABASE, _connect
except ImportError:
    from ..services.auth_store import MYSQL_DATABASE, _connect


def delete_expired_refresh_tokens(now):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM auth_refresh_tokens WHERE expires_at <= %s', (int(now),))
    finally:
        connection.close()


def upsert_refresh_token(token_id, user_id, expires_at, created_at):
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


def get_refresh_token_row(token_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM auth_refresh_tokens WHERE token_id = %s LIMIT 1', (token_id,))
            return cursor.fetchone()
    finally:
        connection.close()


def delete_refresh_token(token_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM auth_refresh_tokens WHERE token_id = %s', (token_id,))
    finally:
        connection.close()


def delete_refresh_tokens_for_user(user_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM auth_refresh_tokens WHERE user_id = %s', (user_id,))
    finally:
        connection.close()