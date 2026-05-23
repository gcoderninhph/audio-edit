try:
    from services.auth_store import ADMIN_USER_ROLE, DEFAULT_USER_ROLE, MYSQL_DATABASE, _connect
except ImportError:
    from ..services.auth_store import ADMIN_USER_ROLE, DEFAULT_USER_ROLE, MYSQL_DATABASE, _connect


def count_admin_accounts():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) AS admin_count FROM auth_users WHERE role = %s', (ADMIN_USER_ROLE,))
            row = cursor.fetchone() or {}
            return int(row.get('admin_count') or 0)
    finally:
        connection.close()


def list_auth_user_rows_page(page_size, offset, search_term=''):
    safe_search_term = ' '.join(str(search_term or '').strip().split())
    where_clause = ''
    where_params = ()
    if safe_search_term:
        like_value = f'%{safe_search_term}%'
        where_clause = ' WHERE display_name LIKE %s OR username LIKE %s OR email LIKE %s'
        where_params = (like_value, like_value, like_value)
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(f'SELECT COUNT(*) AS total_items FROM auth_users{where_clause}', where_params)
            total_items = int((cursor.fetchone() or {}).get('total_items') or 0)
            cursor.execute(
                f'SELECT * FROM auth_users{where_clause} ORDER BY created_at DESC LIMIT %s OFFSET %s',
                (*where_params, int(page_size), int(offset)),
            )
            return {'rows': cursor.fetchall() or [], 'search': safe_search_term, 'totalItems': total_items}
    finally:
        connection.close()


def get_auth_user_summary_row():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    COUNT(*) AS total_users,
                    SUM(CASE WHEN role = %s THEN 1 ELSE 0 END) AS admin_users,
                    SUM(CASE WHEN role = %s THEN 1 ELSE 0 END) AS standard_users,
                    SUM(credits) AS total_credits
                FROM auth_users
                """,
                (ADMIN_USER_ROLE, DEFAULT_USER_ROLE),
            )
            return cursor.fetchone() or {}
    finally:
        connection.close()


def update_auth_user_role(user_id, role):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'UPDATE auth_users SET role = %s, updated_at = UNIX_TIMESTAMP() WHERE id = %s',
                (role, user_id),
            )
    finally:
        connection.close()


def update_auth_user_premium_window(user_id, premium_start_at, premium_end_at, is_premium):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'UPDATE auth_users SET is_premium = %s, premium_start_at = %s, premium_end_at = %s, updated_at = UNIX_TIMESTAMP() WHERE id = %s',
                (1 if is_premium else 0, premium_start_at, premium_end_at, user_id),
            )
    finally:
        connection.close()


def update_auth_user_lock(user_id, is_locked):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'UPDATE auth_users SET is_locked = %s, updated_at = UNIX_TIMESTAMP() WHERE id = %s',
                (1 if is_locked else 0, user_id),
            )
    finally:
        connection.close()