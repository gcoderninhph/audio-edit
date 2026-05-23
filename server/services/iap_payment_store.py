import secrets
import time

try:
    from services.auth_credit_store import update_user_credits
    from services.auth_store import AuthStoreError, _require_driver, ensure_auth_schema, find_user_by_id
    from services.iap_admin_store import list_iap_pack_functions
    from services.iap_beneficiary_store import get_current_iap_beneficiary_account, ensure_iap_beneficiary_schema
    from repositories.iap_payment_repository import (
        cancel_pending_iap_payment_ticket,
        ensure_iap_payment_tables,
        expire_iap_payment_ticket_rows,
        get_iap_payment_ticket_row,
        insert_iap_payment_refund_row,
        insert_iap_payment_ticket_row,
        list_pending_iap_payment_ticket_rows,
        mark_iap_payment_ticket_failed,
        mark_iap_payment_ticket_paid,
        update_auth_user_premium,
        update_iap_payment_ticket_last_client_check,
    )
    from utils.iap_payment_records import list_iap_record_page, paginate_iap_records, row_to_payment_refund, row_to_payment_ticket
    from services.iap_store import get_iap_package
except ImportError:
    from .auth_credit_store import update_user_credits
    from .auth_store import AuthStoreError, _require_driver, ensure_auth_schema, find_user_by_id
    from .iap_admin_store import list_iap_pack_functions
    from .iap_beneficiary_store import get_current_iap_beneficiary_account, ensure_iap_beneficiary_schema
    from ..repositories.iap_payment_repository import (
        cancel_pending_iap_payment_ticket,
        ensure_iap_payment_tables,
        expire_iap_payment_ticket_rows,
        get_iap_payment_ticket_row,
        insert_iap_payment_refund_row,
        insert_iap_payment_ticket_row,
        list_pending_iap_payment_ticket_rows,
        mark_iap_payment_ticket_failed,
        mark_iap_payment_ticket_paid,
        update_auth_user_premium,
        update_iap_payment_ticket_last_client_check,
    )
    from ..utils.iap_payment_records import list_iap_record_page, paginate_iap_records, row_to_payment_refund, row_to_payment_ticket
    from .iap_store import get_iap_package


PAYMENT_TICKET_TTL_SECONDS = 180
PAYMENT_STATUS_PENDING = 'pending'
PAYMENT_STATUS_PAID = 'paid'
PAYMENT_STATUS_CANCELLED = 'cancelled'
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


def ensure_iap_payment_schema():
    global _schema_ready
    if _schema_ready:
        return
    ensure_auth_schema()
    ensure_iap_beneficiary_schema()
    driver = _require_driver()
    try:
        ensure_iap_payment_tables()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to initialize IAP payment schema') from error
    _schema_ready = True


def expire_iap_payment_tickets(now=None):
    ensure_iap_payment_schema()
    safe_now = _now() if now is None else int(now)
    driver = _require_driver()
    try:
        expire_iap_payment_ticket_rows(
            safe_now,
            PAYMENT_STATUS_PENDING,
            PAYMENT_STATUS_EXPIRED,
            'Payment window expired after 3 minutes.',
        )
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
        ticket_id = insert_iap_payment_ticket_row(
            {
                'transaction_code': transaction_code,
                'user_id': user_id,
                'package_id': package['id'],
                'package_name': package['name'],
                'pack_type': package['packType'],
                'beneficiary_account_id': beneficiary['id'],
                'beneficiary_name': beneficiary['name'],
                'bank_id': beneficiary['bankId'],
                'bank_account': beneficiary['bankAccount'],
                'amount': amount,
                'currency': package.get('currency') or 'VND',
                'status': PAYMENT_STATUS_PENDING,
                'expires_at': now + PAYMENT_TICKET_TTL_SECONDS,
                'created_at': now,
                'updated_at': now,
            }
        )
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to create IAP payment ticket') from error
    return get_iap_payment_ticket(ticket_id, user_id=user_id)


def get_iap_payment_ticket(ticket_id, user_id=None, record_client_check=False):
    expire_iap_payment_tickets()
    ensure_iap_payment_schema()
    driver = _require_driver()
    try:
        ticket = row_to_payment_ticket(get_iap_payment_ticket_row(ticket_id, user_id=user_id))
        if not ticket:
            raise IapPaymentNotFoundError('IAP payment ticket not found')
        if record_client_check:
            checked_at = _now()
            update_iap_payment_ticket_last_client_check(ticket['id'], checked_at)
            ticket['lastClientCheckAt'] = checked_at
        return ticket
    except IapPaymentNotFoundError:
        raise
    except (driver.MySQLError, ValueError) as error:
        raise AuthStoreError('Unable to load IAP payment ticket') from error


def cancel_iap_payment_ticket(ticket_id, user_id=None):
    ticket = get_iap_payment_ticket(ticket_id, user_id=user_id)
    if ticket['status'] != PAYMENT_STATUS_PENDING:
        return ticket

    now = _now()
    driver = _require_driver()
    try:
        cancel_pending_iap_payment_ticket(
            ticket['id'],
            PAYMENT_STATUS_PENDING,
            PAYMENT_STATUS_CANCELLED,
            'Cancelled by the desktop client before payment confirmation.',
            now,
        )
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to cancel IAP payment ticket') from error
    return get_iap_payment_ticket(ticket_id, user_id=user_id)


def _insert_refund(ticket, history_record, reason):
    now = _now()
    insert_iap_payment_refund_row(
        {
            'ticket_id': ticket.get('id') if ticket else None,
            'history_id': int(history_record.get('id') or 0) or None,
            'user_id': ticket.get('userId') if ticket else '',
            'transaction_code': ticket.get('transactionCode') if ticket else '',
            'amount': _normalize_int(history_record.get('transferAmount')),
            'account_number': _history_account_number(history_record),
            'reason': reason,
            'status': REFUND_STATUS_PENDING,
            'created_at': now,
            'updated_at': now,
        }
    )


def _fail_ticket(ticket, history_record, reason):
    now = _now()
    mark_iap_payment_ticket_failed(
        ticket['id'],
        PAYMENT_STATUS_FAILED,
        reason,
        int(history_record.get('id') or 0),
        now,
    )
    _insert_refund(ticket, history_record, reason)


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


def _find_matching_pending_ticket(history_record):
    haystack = _history_text(history_record)
    for row in list_pending_iap_payment_ticket_rows(PAYMENT_STATUS_PENDING, _now()):
        ticket = row_to_payment_ticket(row)
        if ticket['transactionCode'].upper() in haystack:
            return ticket
    return None


def _grant_premium(user_id, duration_days):
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
    update_auth_user_premium(user_id, next_start, next_end, now)


def _apply_ticket_entitlement(ticket):
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
            _grant_premium(ticket['userId'], function_record.get('premiumDurationDays'))


def process_iap_payment_hook(history_record):
    expire_iap_payment_tickets()
    ensure_iap_payment_schema()
    driver = _require_driver()
    try:
        ticket = _find_matching_pending_ticket(history_record)
        if not ticket:
            _insert_refund(None, history_record, 'No pending payment ticket matched the transfer content.')
            return {'success': False, 'reason': 'No pending payment ticket matched the transfer content.'}
        account_values = _history_account_values(history_record)
        if ticket['bankAccount'] not in account_values:
            reason = f'Beneficiary account mismatch. Expected {ticket["bankAccount"]}, received {", ".join(sorted(account_values)) or "empty"}.'
            _fail_ticket(ticket, history_record, reason)
            return {'success': False, 'reason': reason, 'ticket': get_iap_payment_ticket(ticket['id'])}
        transfer_amount = _normalize_int(history_record.get('transferAmount'))
        if transfer_amount != ticket['amount']:
            reason = f'Payment amount mismatch. Expected {ticket["amount"]}, received {transfer_amount}.'
            _fail_ticket(ticket, history_record, reason)
            return {'success': False, 'reason': reason, 'ticket': get_iap_payment_ticket(ticket['id'])}
        try:
            _apply_ticket_entitlement(ticket)
        except (AuthStoreError, IapPaymentValidationError) as error:
            reason = f'Payment entitlement validation failed: {error}'
            _fail_ticket(ticket, history_record, reason)
            return {'success': False, 'reason': reason, 'ticket': get_iap_payment_ticket(ticket['id'])}
        now = _now()
        mark_iap_payment_ticket_paid(
            ticket['id'],
            PAYMENT_STATUS_PAID,
            int(history_record.get('id') or 0),
            now,
        )
        return {'success': True, 'ticket': get_iap_payment_ticket(ticket['id'])}
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to process IAP payment hook') from error


def list_iap_payment_tickets_page(page=1, page_size=20):
    expire_iap_payment_tickets()
    safe_page, safe_page_size = paginate_iap_records(page, page_size)
    return list_iap_record_page('iap_payment_tickets', row_to_payment_ticket, safe_page, safe_page_size)


def list_iap_refund_pending_page(page=1, page_size=20):
    ensure_iap_payment_schema()
    safe_page, safe_page_size = paginate_iap_records(page, page_size)
    return list_iap_record_page('iap_payment_refunds', row_to_payment_refund, safe_page, safe_page_size)
