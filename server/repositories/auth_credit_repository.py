import json

try:
    from services.auth_store import MYSQL_DATABASE, _connect
except ImportError:
    from ..services.auth_store import MYSQL_DATABASE, _connect


def create_credit_history_table():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS auth_credit_history (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    user_id VARCHAR(80) NOT NULL,
                    actor_user_id VARCHAR(80) NULL,
                    change_type VARCHAR(40) NOT NULL,
                    delta_credits INT NOT NULL,
                    balance_after INT NOT NULL,
                    note VARCHAR(255) NULL,
                    details_json LONGTEXT NULL,
                    created_at BIGINT NOT NULL,
                    INDEX idx_credit_history_user_created (user_id, created_at),
                    INDEX idx_credit_history_actor_created (actor_user_id, created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
    finally:
        connection.close()


def apply_credit_delta(user_id, delta_credits, *, actor_user_id=None, change_type='adjustment', note=None, details=None, created_at=0):
    safe_created_at = int(created_at or 0)
    safe_details_json = json.dumps(details or {}, ensure_ascii=False, separators=(',', ':'))
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            if int(delta_credits) < 0:
                required_credits = abs(int(delta_credits))
                cursor.execute(
                    """
                    UPDATE auth_users
                    SET credits = credits - %s, updated_at = %s
                    WHERE id = %s AND credits >= %s
                    """,
                    (required_credits, safe_created_at, user_id, required_credits),
                )
                if cursor.rowcount == 0:
                    cursor.execute('SELECT credits FROM auth_users WHERE id = %s LIMIT 1', (user_id,))
                    credit_row = cursor.fetchone()
                    return {
                        'status': 'insufficient' if credit_row else 'missing',
                        'availableCredits': int((credit_row or {}).get('credits') or 0),
                        'requiredCredits': required_credits,
                    }
            else:
                cursor.execute(
                    'UPDATE auth_users SET credits = credits + %s, updated_at = %s WHERE id = %s',
                    (int(delta_credits), safe_created_at, user_id),
                )
                if cursor.rowcount == 0:
                    return {'status': 'missing'}

            cursor.execute('SELECT * FROM auth_users WHERE id = %s LIMIT 1', (user_id,))
            user_row = cursor.fetchone()
            if not user_row:
                return {'status': 'missing'}

            cursor.execute(
                """
                INSERT INTO auth_credit_history
                    (user_id, actor_user_id, change_type, delta_credits, balance_after, note, details_json, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    actor_user_id or None,
                    str(change_type or 'adjustment'),
                    int(delta_credits or 0),
                    max(0, int(user_row.get('credits') or 0)),
                    (str(note or '').strip() or None),
                    safe_details_json,
                    safe_created_at,
                ),
            )
            cursor.execute('SELECT * FROM auth_credit_history WHERE id = LAST_INSERT_ID() LIMIT 1')
            return {
                'status': 'ok',
                'historyRow': cursor.fetchone(),
                'userRow': user_row,
            }
    finally:
        connection.close()


def get_credit_history_page_rows(user_id, page_size, offset):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) AS total_items FROM auth_credit_history WHERE user_id = %s', (user_id,))
            total_items = int((cursor.fetchone() or {}).get('total_items') or 0)
            cursor.execute(
                """
                SELECT *
                FROM auth_credit_history
                WHERE user_id = %s
                ORDER BY created_at DESC, id DESC
                LIMIT %s OFFSET %s
                """,
                (user_id, int(page_size), int(offset)),
            )
            return {'rows': cursor.fetchall() or [], 'totalItems': total_items}
    finally:
        connection.close()