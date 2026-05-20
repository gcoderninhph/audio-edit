import secrets
import time

try:
    from auth_credit_store import update_user_credits
    from auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _require_driver, ensure_auth_schema, find_user_by_id
    from iap_admin_store import list_iap_pack_functions
    from iap_beneficiary_store import get_current_iap_beneficiary_account, ensure_iap_beneficiary_schema
    from iap_store import IapPackageNotFoundError, get_iap_package
except ImportError:
    from .auth_credit_store import update_user_credits
    from .auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _require_driver, ensure_auth_schema, find_user_by_id
    from .iap_admin_store import list_iap_pack_functions
    from .iap_beneficiary_store import get_current_iap_beneficiary_account, ensure_iap_beneficiary_schema
    from .iap_store import IapPackageNotFoundError, get_iap_package


PAYMENT_TICKET_TTL_SECONDS = 180
PAYMENT_STATUS_PENDING = 'pending'
PAYMENT_STATUS_PAID = 'paid'
PAYMENT_STATUS_FAILED = 'failed'
PAYMENT_STATUS_EXPIRED = 'expired'
REFUND_STATUS_PENDING = 'pending'
_schema_ready = False


class IapPaymentValidationError(ValueError):
    pass


class IapPaymentNotFoundError(AuthStoreError):
    pass


def _now():
    return int(time.time())


def _normalize_int(value):
    if value in (None, ''):
        return 0
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    try:
        return int(float(str(value).strip().replace(',', '')))
    except ValueError:
        return 0


def _normalize_amount(value):
    amount = int(round(float(value or 0)))
    if amount <= 0:
        raise IapPaymentValidationError('Payment amount must be greater than 0.')
    return amount


def _normalize_text(value, max_length=255):
    normalized_value = ' '.join(str(value or '').strip().split())
    return normalized_value[:max_length]


def _row_to_ticket(row):
    if not row:
        return None
    return {
        'id': int(row.get('id') or 0),
        'transactionCode': row.get('transaction_code') or '',
        'userId': row.get('user_id') or '',
        'packageId': row.get('package_id') or '',
        'packageName': row.get('package_name') or '',
        'packType': row.get('pack_type') or '',
        'beneficiaryAccountId': int(row.get('beneficiary_account_id') or 0),
        'beneficiaryName': row.get('beneficiary_name') or '',
        'bankId': row.get('bank_id') or '',
        'bankAccount': row.get('bank_account') or '',
        'amount': int(row.get('amount') or 0),
        'currency': row.get('currency') or 'VND',
        'status': row.get('status') or PAYMENT_STATUS_PENDING,
        'failureReason': row.get('failure_reason') or '',
        'historyId': int(row.get('history_id') or 0),
        'expiresAt': int(row.get('expires_at') or 0),
        'completedAt': int(row.get('completed_at') or 0),
        'createdAt': int(row.get('created_at') or 0),
        'updatedAt': int(row.get('updated_at') or 0),
    }


def _row_to_refund(row):
    if not row:
        return None
    return {
        'id': int(row.get('id') or 0),
        'ticketId': int(row.get('ticket_id') or 0),
        'historyId': int(row.get('history_id') or 0),
        'userId': row.get('user_id') or '',
        'transactionCode': row.get('transaction_code') or '',
        'amount': int(row.get('amount') or 0),
        'accountNumber': row.get('account_number') or '',
        'reason': row.get('reason') or '',
        'status': row.get('status') or REFUND_STATUS_PENDING,
        'createdAt': int(row.get('created_at') or 0),
        'updatedAt': int(row.get('updated_at') or 0),
    }


def ensure_iap_payment_schema():
    global _schema_ready
    if _schema_ready:
        return
    ensure_auth_schema()
    ensure_iap_beneficiary_schema()
    driver = _require_driver()
    try:
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
                        updated_at BIGINT NOT NULL,
                        INDEX idx_iap_payment_user_created (user_id, created_at),
                        INDEX idx_iap_payment_status_expires (status, expires_at),
                        INDEX idx_iap_payment_history (history_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    """
                )
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
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to initialize IAP payment schema') from error
    _schema_ready = True


def expire_iap_payment_tickets(now=None):
    ensure_iap_payment_schema()
    safe_now = _now() if now is None else int(now)
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    'UPDATE iap_payment_tickets SET status = %s, failure_reason = %s, updated_at = %s WHERE status = %s AND expires_at <= %s',
                    (PAYMENT_STATUS_EXPIRED, 'Payment window expired after 3 minutes.', safe_now, PAYMENT_STATUS_PENDING, safe_now),
                )
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to expire IAP payment tickets') from error


def create_iap_payment_ticket(user_id, package_id):
    expire_iap_payment_tickets()
    package = get_iap_package(package_id)
    if not package.get('isActive'):
        raise IapPaymentValidationError('This IAP package is not active.')
    beneficiary = get_current_iap_beneficiary_account()
    amount = _normalize_amount(package.get('price'))
    now = _now()
    transaction_code = f'IAP{now}{secrets.token_hex(3).upper()}'
    driver = _require_driver()
    try:
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
                        transaction_code,
                        user_id,
                        package['id'],
                        package['name'],
                        package['packType'],
                        beneficiary['id'],
                        beneficiary['name'],
                        beneficiary['bankId'],
                        beneficiary['bankAccount'],
                        amount,
                        package.get('currency') or 'VND',
                        PAYMENT_STATUS_PENDING,
                        now + PAYMENT_TICKET_TTL_SECONDS,
                        now,
                        now,
                    ),
                )
                ticket_id = cursor.lastrowid
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to create IAP payment ticket') from error
    return get_iap_payment_ticket(ticket_id, user_id=user_id)


def get_iap_payment_ticket(ticket_id, user_id=None):
    expire_iap_payment_tickets()
    ensure_iap_payment_schema()
    driver = _require_driver()
    params = [int(ticket_id)]
    user_clause = ''
    if user_id is not None:
        user_clause = ' AND user_id = %s'
        params.append(user_id)
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(f'SELECT * FROM iap_payment_tickets WHERE id = %s{user_clause} LIMIT 1', tuple(params))
                ticket = _row_to_ticket(cursor.fetchone())
                if not ticket:
                    raise IapPaymentNotFoundError('IAP payment ticket not found')
                return ticket
        finally:
            connection.close()
    except IapPaymentNotFoundError:
        raise
    except (driver.MySQLError, ValueError) as error:
        raise AuthStoreError('Unable to load IAP payment ticket') from error


def _insert_refund(cursor, ticket, history_record, reason):
    now = _now()
    cursor.execute(
        """
        INSERT INTO iap_payment_refunds
            (ticket_id, history_id, user_id, transaction_code, amount, account_number, reason, status, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            ticket.get('id') if ticket else None,
            int(history_record.get('id') or 0) or None,
            ticket.get('userId') if ticket else '',
            ticket.get('transactionCode') if ticket else '',
            _normalize_int(history_record.get('transferAmount')),
            _history_account_number(history_record),
            reason,
            REFUND_STATUS_PENDING,
            now,
            now,
        ),
    )


def _fail_ticket(cursor, ticket, history_record, reason):
    now = _now()
    cursor.execute(
        'UPDATE iap_payment_tickets SET status = %s, failure_reason = %s, history_id = %s, completed_at = %s, updated_at = %s WHERE id = %s',
        (PAYMENT_STATUS_FAILED, reason, int(history_record.get('id') or 0), now, now, ticket['id']),
    )
    _insert_refund(cursor, ticket, history_record, reason)


def _history_text(history_record):
    payload = history_record.get('payload') or {}
    values = [history_record.get('content'), history_record.get('description'), history_record.get('code'), history_record.get('referenceCode')]
    values.extend(payload.get(key) for key in ('content', 'description', 'code', 'referenceCode', 'transactionContent'))
    return ' '.join(str(value or '') for value in values).upper()


def _history_account_values(history_record):
    payload = history_record.get('payload') or {}
    values = [history_record.get('accountNumber'), history_record.get('subAccount')]
    values.extend(payload.get(key) for key in ('accountId', 'accountNumber', 'bankAccount', 'receiverAccount', 'subAccount'))
    return {str(value or '').strip() for value in values if str(value or '').strip()}


def _history_account_number(history_record):
    values = _history_account_values(history_record)
    return next(iter(values), '')


def _find_matching_pending_ticket(cursor, history_record):
    haystack = _history_text(history_record)
    cursor.execute('SELECT * FROM iap_payment_tickets WHERE status = %s AND expires_at > %s ORDER BY created_at ASC', (PAYMENT_STATUS_PENDING, _now()))
    for row in cursor.fetchall() or []:
        ticket = _row_to_ticket(row)
        if ticket['transactionCode'].upper() in haystack:
            return ticket
    return None


def _grant_premium(cursor, user_id, duration_days):
    days = int(duration_days or 0)
    if days <= 0:
        return
    user = find_user_by_id(user_id)
    if not user:
        raise AuthStoreError('Auth user not found')
    now = _now()
    current_end = int(user.get('premiumEndAt') or 0)
    next_start = int(user.get('premiumStartAt') or 0) if current_end > now else now
    next_end = max(now, current_end) + days * 86400
    cursor.execute(
        'UPDATE auth_users SET is_premium = 1, premium_start_at = %s, premium_end_at = %s, updated_at = %s WHERE id = %s',
        (next_start, next_end, now, user_id),
    )


def _apply_ticket_entitlement(cursor, ticket):
    functions = [record for record in list_iap_pack_functions() if record.get('isActive') and record.get('packIapId') == ticket['packageId']]
    if not functions:
        raise IapPaymentValidationError('No active pack function is configured for this package.')
    for function_record in functions:
        function_type = function_record.get('functionType')
        if function_type in {'addCredits', 'creditsAndPremium'} and int(function_record.get('credits') or 0) > 0:
            update_user_credits(
                ticket['userId'],
                int(function_record.get('credits') or 0),
                change_type='iap_payment',
                note=f'IAP payment {ticket["transactionCode"]}',
                details={'paymentTicketId': ticket['id'], 'packageId': ticket['packageId']},
            )
        if function_type in {'unlockPremium', 'creditsAndPremium'}:
            _grant_premium(cursor, ticket['userId'], function_record.get('premiumDurationDays'))


def process_iap_payment_hook(history_record):
    expire_iap_payment_tickets()
    ensure_iap_payment_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                ticket = _find_matching_pending_ticket(cursor, history_record)
                if not ticket:
                    _insert_refund(cursor, None, history_record, 'No pending payment ticket matched the transfer content.')
                    return {'success': False, 'reason': 'No pending payment ticket matched the transfer content.'}
                account_values = _history_account_values(history_record)
                if ticket['bankAccount'] not in account_values:
                    reason = f'Beneficiary account mismatch. Expected {ticket["bankAccount"]}, received {", ".join(sorted(account_values)) or "empty"}.'
                    _fail_ticket(cursor, ticket, history_record, reason)
                    return {'success': False, 'reason': reason, 'ticket': get_iap_payment_ticket(ticket['id'])}
                transfer_amount = _normalize_int(history_record.get('transferAmount'))
                if transfer_amount != ticket['amount']:
                    reason = f'Payment amount mismatch. Expected {ticket["amount"]}, received {transfer_amount}.'
                    _fail_ticket(cursor, ticket, history_record, reason)
                    return {'success': False, 'reason': reason, 'ticket': get_iap_payment_ticket(ticket['id'])}
                try:
                    _apply_ticket_entitlement(cursor, ticket)
                except (AuthStoreError, IapPaymentValidationError) as error:
                    reason = f'Payment entitlement validation failed: {error}'
                    _fail_ticket(cursor, ticket, history_record, reason)
                    return {'success': False, 'reason': reason, 'ticket': get_iap_payment_ticket(ticket['id'])}
                now = _now()
                cursor.execute(
                    'UPDATE iap_payment_tickets SET status = %s, history_id = %s, completed_at = %s, updated_at = %s WHERE id = %s',
                    (PAYMENT_STATUS_PAID, int(history_record.get('id') or 0), now, now, ticket['id']),
                )
                return {'success': True, 'ticket': get_iap_payment_ticket(ticket['id'])}
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to process IAP payment hook') from error


def _paginate(page=1, page_size=20):
    safe_page = max(1, int(page or 1))
    safe_page_size = max(1, min(100, int(page_size or 20)))
    return safe_page, safe_page_size


def list_iap_payment_tickets_page(page=1, page_size=20):
    expire_iap_payment_tickets()
    safe_page, safe_page_size = _paginate(page, page_size)
    return _list_page('iap_payment_tickets', _row_to_ticket, safe_page, safe_page_size)


def list_iap_refund_pending_page(page=1, page_size=20):
    ensure_iap_payment_schema()
    safe_page, safe_page_size = _paginate(page, page_size)
    return _list_page('iap_payment_refunds', _row_to_refund, safe_page, safe_page_size)


def _list_page(table_name, row_mapper, page, page_size):
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(f'SELECT COUNT(*) AS total_items FROM {table_name}')
                total_items = int((cursor.fetchone() or {}).get('total_items') or 0)
                total_pages = max(1, (total_items + page_size - 1) // page_size)
                safe_page = min(page, total_pages)
                cursor.execute(f'SELECT * FROM {table_name} ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s', (page_size, (safe_page - 1) * page_size))
                return {
                    'items': [row_mapper(row) for row in cursor.fetchall() or []],
                    'pagination': {'page': safe_page, 'pageSize': page_size, 'totalItems': total_items, 'totalPages': total_pages},
                }
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list IAP payment records') from error
