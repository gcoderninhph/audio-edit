try:
    from services.auth_store import MYSQL_DATABASE, _connect, _ensure_column
except ImportError:
    from ..services.auth_store import MYSQL_DATABASE, _connect, _ensure_column


ALLOWED_IAP_RECORD_TABLES = {
    'iap_payment_tickets',
    'iap_payment_refunds',
}


def ensure_iap_payment_tables():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS iap_payment_tickets (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    transaction_code VARCHAR(80) NOT NULL UNIQUE,
                    user_id VARCHAR(80) NOT NULL,
                    package_id VARCHAR(80) NOT NULL,
                    package_name VARCHAR(120) NOT NULL,
                    pack_type VARCHAR(64) NOT NULL,
                    beneficiary_account_id BIGINT NOT NULL,
                    beneficiary_name VARCHAR(120) NOT NULL,
                    bank_id VARCHAR(40) NOT NULL,
                    bank_account VARCHAR(80) NOT NULL,
                    amount BIGINT NOT NULL,
                    currency VARCHAR(3) NOT NULL DEFAULT 'VND',
                    status VARCHAR(24) NOT NULL DEFAULT 'pending',
                    failure_reason TEXT NULL,
                    history_id BIGINT NULL,
                    expires_at BIGINT NOT NULL,
                    completed_at BIGINT NOT NULL DEFAULT 0,
                    created_at BIGINT NOT NULL,
                    last_client_check_at BIGINT NOT NULL DEFAULT 0,
                    updated_at BIGINT NOT NULL,
                    INDEX idx_iap_payment_user_created (user_id, created_at),
                    INDEX idx_iap_payment_status_expires (status, expires_at),
                    INDEX idx_iap_payment_history (history_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            _ensure_column(cursor, 'iap_payment_tickets', 'last_client_check_at', 'BIGINT NOT NULL DEFAULT 0 AFTER created_at')
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS iap_payment_refunds (
                    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    ticket_id BIGINT NULL,
                    history_id BIGINT NULL,
                    user_id VARCHAR(80) NOT NULL DEFAULT '',
                    transaction_code VARCHAR(80) NOT NULL DEFAULT '',
                    amount BIGINT NOT NULL DEFAULT 0,
                    account_number VARCHAR(80) NOT NULL DEFAULT '',
                    reason TEXT NOT NULL,
                    status VARCHAR(24) NOT NULL DEFAULT 'pending',
                    created_at BIGINT NOT NULL,
                    updated_at BIGINT NOT NULL,
                    INDEX idx_iap_refund_status_created (status, created_at),
                    INDEX idx_iap_refund_ticket (ticket_id),
                    INDEX idx_iap_refund_history (history_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
    finally:
        connection.close()


def expire_iap_payment_ticket_rows(now, pending_status, expired_status, failure_reason):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'UPDATE iap_payment_tickets SET status = %s, failure_reason = %s, updated_at = %s WHERE status = %s AND expires_at <= %s',
                (expired_status, failure_reason, int(now), pending_status, int(now)),
            )
    finally:
        connection.close()


def insert_iap_payment_ticket_row(ticket_payload):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO iap_payment_tickets
                    (transaction_code, user_id, package_id, package_name, pack_type, beneficiary_account_id, beneficiary_name, bank_id, bank_account, amount, currency, status, expires_at, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    ticket_payload['transaction_code'],
                    ticket_payload['user_id'],
                    ticket_payload['package_id'],
                    ticket_payload['package_name'],
                    ticket_payload['pack_type'],
                    int(ticket_payload['beneficiary_account_id']),
                    ticket_payload['beneficiary_name'],
                    ticket_payload['bank_id'],
                    ticket_payload['bank_account'],
                    int(ticket_payload['amount']),
                    ticket_payload['currency'],
                    ticket_payload['status'],
                    int(ticket_payload['expires_at']),
                    int(ticket_payload['created_at']),
                    int(ticket_payload['updated_at']),
                ),
            )
            return int(cursor.lastrowid)
    finally:
        connection.close()


def get_iap_payment_ticket_row(ticket_id, user_id=None):
    params = [int(ticket_id)]
    user_clause = ''
    if user_id is not None:
        user_clause = ' AND user_id = %s'
        params.append(user_id)
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(f'SELECT * FROM iap_payment_tickets WHERE id = %s{user_clause} LIMIT 1', tuple(params))
            return cursor.fetchone()
    finally:
        connection.close()


def update_iap_payment_ticket_last_client_check(ticket_id, checked_at):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('UPDATE iap_payment_tickets SET last_client_check_at = %s WHERE id = %s', (int(checked_at), int(ticket_id)))
    finally:
        connection.close()


def cancel_pending_iap_payment_ticket(ticket_id, pending_status, cancelled_status, failure_reason, now):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'UPDATE iap_payment_tickets SET status = %s, failure_reason = %s, completed_at = %s, updated_at = %s WHERE id = %s AND status = %s',
                (cancelled_status, failure_reason, int(now), int(now), int(ticket_id), pending_status),
            )
    finally:
        connection.close()


def list_pending_iap_payment_ticket_rows(pending_status, now):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT * FROM iap_payment_tickets WHERE status = %s AND expires_at > %s ORDER BY created_at ASC',
                (pending_status, int(now)),
            )
            return cursor.fetchall() or []
    finally:
        connection.close()


def insert_iap_payment_refund_row(refund_payload):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO iap_payment_refunds
                    (ticket_id, history_id, user_id, transaction_code, amount, account_number, reason, status, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    refund_payload['ticket_id'],
                    refund_payload['history_id'],
                    refund_payload['user_id'],
                    refund_payload['transaction_code'],
                    int(refund_payload['amount']),
                    refund_payload['account_number'],
                    refund_payload['reason'],
                    refund_payload['status'],
                    int(refund_payload['created_at']),
                    int(refund_payload['updated_at']),
                ),
            )
    finally:
        connection.close()


def mark_iap_payment_ticket_failed(ticket_id, failed_status, reason, history_id, now):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'UPDATE iap_payment_tickets SET status = %s, failure_reason = %s, history_id = %s, completed_at = %s, updated_at = %s WHERE id = %s',
                (failed_status, reason, history_id, int(now), int(now), int(ticket_id)),
            )
    finally:
        connection.close()


def mark_iap_payment_ticket_paid(ticket_id, paid_status, history_id, now):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'UPDATE iap_payment_tickets SET status = %s, history_id = %s, completed_at = %s, updated_at = %s WHERE id = %s',
                (paid_status, history_id, int(now), int(now), int(ticket_id)),
            )
    finally:
        connection.close()


def update_auth_user_premium(user_id, premium_start_at, premium_end_at, updated_at):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'UPDATE auth_users SET is_premium = 1, premium_start_at = %s, premium_end_at = %s, updated_at = %s WHERE id = %s',
                (int(premium_start_at), int(premium_end_at), int(updated_at), user_id),
            )
    finally:
        connection.close()


def list_iap_record_rows(table_name, page, page_size):
    if table_name not in ALLOWED_IAP_RECORD_TABLES:
        raise ValueError('Unsupported IAP record table')
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(f'SELECT COUNT(*) AS total_items FROM {table_name}')
            total_items = int((cursor.fetchone() or {}).get('total_items') or 0)
            total_pages = max(1, (total_items + page_size - 1) // page_size)
            safe_page = min(page, total_pages)
            cursor.execute(
                f'SELECT * FROM {table_name} ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s',
                (page_size, (safe_page - 1) * page_size),
            )
            return {
                'rows': cursor.fetchall() or [],
                'pagination': {
                    'page': safe_page,
                    'pageSize': page_size,
                    'totalItems': total_items,
                    'totalPages': total_pages,
                },
            }
    finally:
        connection.close()