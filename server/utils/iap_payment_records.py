try:
    from utils.pagination import normalize_pagination
    from services.auth_store import AuthStoreError, _require_driver
    from repositories.iap_payment_repository import list_iap_record_rows
except ImportError:
    from .pagination import normalize_pagination
    from ..services.auth_store import AuthStoreError, _require_driver
    from ..repositories.iap_payment_repository import list_iap_record_rows


def row_to_payment_ticket(row):
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
        'status': row.get('status') or 'pending',
        'failureReason': row.get('failure_reason') or '',
        'historyId': int(row.get('history_id') or 0),
        'expiresAt': int(row.get('expires_at') or 0),
        'completedAt': int(row.get('completed_at') or 0),
        'createdAt': int(row.get('created_at') or 0),
        'lastClientCheckAt': int(row.get('last_client_check_at') or 0),
        'updatedAt': int(row.get('updated_at') or 0),
    }


def row_to_payment_refund(row):
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
        'status': row.get('status') or 'pending',
        'createdAt': int(row.get('created_at') or 0),
        'updatedAt': int(row.get('updated_at') or 0),
    }


def paginate_iap_records(page=1, page_size=20):
    return normalize_pagination(page, page_size, default_page_size=20, max_page_size=100)


def list_iap_record_page(table_name, row_mapper, page, page_size):
    driver = _require_driver()
    try:
        result = list_iap_record_rows(table_name, page, page_size)
        return {
            'items': [row_mapper(row) for row in result['rows']],
            'pagination': result['pagination'],
        }
    except ValueError as error:
        raise AuthStoreError('Unable to list IAP payment records') from error
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list IAP payment records') from error