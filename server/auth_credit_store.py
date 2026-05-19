import json
import time

try:
    from auth_store import (
        AuthStoreError,
        InsufficientCreditsError,
        MYSQL_DATABASE,
        _connect,
        _require_driver,
        _row_to_user_record,
        ensure_auth_schema,
        find_user_by_id,
    )
except ImportError:
    from .auth_store import (
        AuthStoreError,
        InsufficientCreditsError,
        MYSQL_DATABASE,
        _connect,
        _require_driver,
        _row_to_user_record,
        ensure_auth_schema,
        find_user_by_id,
    )


_credit_history_schema_ready = False


def _normalize_pagination(page, page_size, default_page_size=10, max_page_size=100):
    safe_page = max(1, int(page or 1))
    safe_page_size = max(1, min(max_page_size, int(page_size or default_page_size)))
    return safe_page, safe_page_size


def _build_pagination(page, page_size, total_items):
    safe_total_items = max(0, int(total_items or 0))
    total_pages = max(1, (safe_total_items + page_size - 1) // page_size)
    safe_page = min(max(1, int(page or 1)), total_pages)
    return {
        'page': safe_page,
        'pageSize': page_size,
        'totalItems': safe_total_items,
        'totalPages': total_pages,
        'hasNext': safe_page < total_pages,
        'hasPrevious': safe_page > 1,
    }


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
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to initialize auth credit history schema') from error

    _credit_history_schema_ready = True


def _insert_credit_history_entry(cursor, user_id, actor_user_id, change_type, delta_credits, balance_after, note=None, details=None, created_at=None):
    safe_created_at = int(created_at or time.time())
    safe_details_json = json.dumps(details or {}, ensure_ascii=False, separators=(',', ':'))
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
            max(0, int(balance_after or 0)),
            (str(note or '').strip() or None),
            safe_details_json,
            safe_created_at,
        ),
    )
    cursor.execute('SELECT * FROM auth_credit_history WHERE id = LAST_INSERT_ID() LIMIT 1')
    return _row_to_credit_event(cursor.fetchone())


def update_user_credits(user_id, delta_credits, *, change_type='adjustment', actor_user_id=None, note=None, details=None):
    ensure_credit_history_schema()
    driver = _require_driver()
    safe_delta = int(delta_credits or 0)
    if safe_delta == 0:
        return find_user_by_id(user_id)

    now = int(time.time())
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                if safe_delta < 0:
                    required_credits = abs(safe_delta)
                    cursor.execute(
                        """
                        UPDATE auth_users
                        SET credits = credits - %s, updated_at = %s
                        WHERE id = %s AND credits >= %s
                        """,
                        (required_credits, now, user_id, required_credits),
                    )
                    if cursor.rowcount == 0:
                        cursor.execute('SELECT credits FROM auth_users WHERE id = %s LIMIT 1', (user_id,))
                        credit_row = cursor.fetchone()
                        if not credit_row:
                            raise AuthStoreError('Auth user not found')
                        raise InsufficientCreditsError(credit_row.get('credits') or 0, required_credits)
                else:
                    cursor.execute(
                        'UPDATE auth_users SET credits = credits + %s, updated_at = %s WHERE id = %s',
                        (safe_delta, now, user_id),
                    )
                    if cursor.rowcount == 0:
                        raise AuthStoreError('Auth user not found')

                cursor.execute('SELECT * FROM auth_users WHERE id = %s LIMIT 1', (user_id,))
                updated_user = _row_to_user_record(cursor.fetchone())
                if not updated_user:
                    raise AuthStoreError('Auth user not found')

                _insert_credit_history_entry(
                    cursor,
                    user_id,
                    actor_user_id,
                    change_type,
                    safe_delta,
                    updated_user.get('credits') or 0,
                    note=note,
                    details=details,
                    created_at=now,
                )
                return updated_user
        finally:
            connection.close()
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
    safe_page, safe_page_size = _normalize_pagination(page, page_size)
    offset = (safe_page - 1) * safe_page_size
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT COUNT(*) AS total_items FROM auth_credit_history WHERE user_id = %s', (user_id,))
                total_items = int((cursor.fetchone() or {}).get('total_items') or 0)
                pagination = _build_pagination(safe_page, safe_page_size, total_items)
                cursor.execute(
                    """
                    SELECT *
                    FROM auth_credit_history
                    WHERE user_id = %s
                    ORDER BY created_at DESC, id DESC
                    LIMIT %s OFFSET %s
                    """,
                    (user_id, pagination['pageSize'], (pagination['page'] - 1) * pagination['pageSize']),
                )
                return {
                    'history': [_row_to_credit_event(row) for row in cursor.fetchall() or []],
                    'pagination': pagination,
                }
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to read auth credit history') from error