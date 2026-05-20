try:
    from auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _require_driver
except ImportError:
    from .auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _require_driver


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
    safe_page = max(1, int(page or 1))
    safe_page_size = max(1, min(100, int(page_size or 20)))
    return safe_page, safe_page_size


def list_iap_record_page(table_name, row_mapper, page, page_size):
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