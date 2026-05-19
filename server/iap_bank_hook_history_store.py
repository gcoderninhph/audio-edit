import json
import time
from datetime import datetime

try:
    from auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _require_driver, ensure_auth_schema
except ImportError:
    from .auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _require_driver, ensure_auth_schema


_history_schema_ready = False


class IapBankHookHistoryNotFoundError(AuthStoreError):
    pass


def _now():
    return int(time.time())


def _normalize_pagination(page, page_size, default_page_size=20, max_page_size=100):
    safe_page = max(1, int(page or 1))
    safe_page_size = max(1, min(max_page_size, int(page_size or default_page_size)))
    return safe_page, safe_page_size


def _normalize_search_term(value):
    return ' '.join(str(value or '').strip().split())


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


def _normalize_text(value, max_length=255):
    normalized_value = str(value or '').strip()
    if len(normalized_value) > max_length:
        return normalized_value[:max_length]
    return normalized_value


def _normalize_integer(value):
    if value in (None, ''):
        return 0
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)

    normalized_value = str(value).strip().replace(',', '')
    if not normalized_value:
        return 0
    try:
        return int(float(normalized_value))
    except ValueError:
        return 0


def _normalize_payload(payload):
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, list):
        return {'items': payload}
    if payload is None:
        return {}
    return {'value': payload}


def _parse_transaction_at(value):
    if value in (None, ''):
        return 0
    if isinstance(value, (int, float)):
        safe_timestamp = int(value)
        return safe_timestamp // 1000 if safe_timestamp > 10_000_000_000 else safe_timestamp

    normalized_value = str(value).strip()
    if not normalized_value:
        return 0

    numeric_value = normalized_value.replace(',', '')
    if numeric_value.isdigit():
        safe_timestamp = int(numeric_value)
        return safe_timestamp // 1000 if safe_timestamp > 10_000_000_000 else safe_timestamp

    known_formats = (
        '%Y-%m-%d %H:%M:%S',
        '%Y-%m-%d %H:%M',
        '%Y-%m-%dT%H:%M:%S',
        '%Y-%m-%dT%H:%M',
    )
    for date_format in known_formats:
        try:
            return int(datetime.strptime(normalized_value, date_format).timestamp())
        except ValueError:
            continue

    try:
        return int(datetime.fromisoformat(normalized_value.replace('Z', '+00:00')).timestamp())
    except ValueError:
        return 0


def _parse_date_boundary(value, *, end_of_day=False):
    normalized_value = str(value or '').strip()
    if not normalized_value:
        return 0

    try:
        parsed_date = datetime.strptime(normalized_value, '%Y-%m-%d')
    except ValueError:
        return 0

    timestamp = int(parsed_date.timestamp())
    return timestamp + 86_399 if end_of_day else timestamp


def _effective_timestamp_sql():
    return 'CASE WHEN transaction_at > 0 THEN transaction_at ELSE created_at END'


def _build_history_filters(search_term='', start_date='', end_date=''):
    clauses = []
    params = []

    safe_search_term = _normalize_search_term(search_term)
    safe_start_at = _parse_date_boundary(start_date)
    safe_end_at = _parse_date_boundary(end_date, end_of_day=True)

    if safe_search_term:
        like_value = f'%{safe_search_term}%'
        clauses.append('(content LIKE %s OR code LIKE %s OR reference_code LIKE %s OR account_number LIKE %s)')
        params.extend((like_value, like_value, like_value, like_value))

    if safe_start_at:
        clauses.append(f'({_effective_timestamp_sql()}) >= %s')
        params.append(safe_start_at)

    if safe_end_at:
        clauses.append(f'({_effective_timestamp_sql()}) <= %s')
        params.append(safe_end_at)

    where_clause = f" WHERE {' AND '.join(clauses)}" if clauses else ''
    return where_clause, tuple(params), safe_search_term, safe_start_at, safe_end_at


def _row_to_bank_hook_history(row):
    if not row:
        return None

    payload_json = row.get('payload_json')
    try:
        payload = json.loads(payload_json) if payload_json else {}
    except json.JSONDecodeError:
        payload = {}

    return {
        'id': int(row.get('id') or 0),
        'apiKeyId': int(row.get('api_key_id') or 0),
        'apiKeyName': row.get('api_key_name') or '',
        'gateway': row.get('gateway') or '',
        'transactionAt': int(row.get('transaction_at') or 0),
        'transactionDate': row.get('transaction_date_text') or '',
        'accountNumber': row.get('account_number') or '',
        'subAccount': row.get('sub_account') or '',
        'code': row.get('code') or '',
        'content': row.get('content') or '',
        'transferType': row.get('transfer_type') or '',
        'description': row.get('description') or '',
        'transferAmount': int(row.get('transfer_amount') or 0),
        'accumulated': int(row.get('accumulated') or 0),
        'referenceCode': row.get('reference_code') or '',
        'payload': payload,
        'receivedAt': int(row.get('created_at') or 0),
    }


def get_iap_bank_hook_history(history_id):
    ensure_iap_bank_hook_history_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM iap_bank_hook_history WHERE id = %s LIMIT 1', (int(history_id),))
                row = cursor.fetchone()
                if not row:
                    raise IapBankHookHistoryNotFoundError('IAP bank hook history record not found')
                return _row_to_bank_hook_history(row)
        finally:
            connection.close()
    except IapBankHookHistoryNotFoundError:
        raise
    except (driver.MySQLError, ValueError) as error:
        raise AuthStoreError('Unable to load IAP bank hook history') from error


def ensure_iap_bank_hook_history_schema():
    global _history_schema_ready
    if _history_schema_ready:
        return

    ensure_auth_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS iap_bank_hook_history (
                        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                        api_key_id BIGINT NOT NULL,
                        api_key_name VARCHAR(120) NOT NULL,
                        gateway VARCHAR(120) NOT NULL DEFAULT '',
                        transaction_at BIGINT NOT NULL DEFAULT 0,
                        transaction_date_text VARCHAR(64) NOT NULL DEFAULT '',
                        account_number VARCHAR(80) NOT NULL DEFAULT '',
                        sub_account VARCHAR(80) NOT NULL DEFAULT '',
                        code VARCHAR(120) NOT NULL DEFAULT '',
                        content TEXT NULL,
                        transfer_type VARCHAR(32) NOT NULL DEFAULT '',
                        description TEXT NULL,
                        transfer_amount BIGINT NOT NULL DEFAULT 0,
                        accumulated BIGINT NOT NULL DEFAULT 0,
                        reference_code VARCHAR(160) NOT NULL DEFAULT '',
                        payload_json LONGTEXT NULL,
                        created_at BIGINT NOT NULL,
                        INDEX idx_iap_bank_hook_history_created (created_at),
                        INDEX idx_iap_bank_hook_history_api_key_created (api_key_id, created_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    """
                )
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to initialize IAP bank hook history schema') from error

    _history_schema_ready = True


def record_iap_bank_hook_history(api_key_record, payload):
    ensure_iap_bank_hook_history_schema()
    driver = _require_driver()
    safe_payload = _normalize_payload(payload)
    safe_created_at = _now()
    transaction_date = _normalize_text(safe_payload.get('transactionDate'), max_length=64)
    transaction_at = _parse_transaction_at(transaction_date or safe_payload.get('transactionAt'))
    payload_json = json.dumps(safe_payload, ensure_ascii=False, default=str, separators=(',', ':'))
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO iap_bank_hook_history (
                        api_key_id,
                        api_key_name,
                        gateway,
                        transaction_at,
                        transaction_date_text,
                        account_number,
                        sub_account,
                        code,
                        content,
                        transfer_type,
                        description,
                        transfer_amount,
                        accumulated,
                        reference_code,
                        payload_json,
                        created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        int(api_key_record.get('id') or 0),
                        _normalize_text(api_key_record.get('name'), max_length=120),
                        _normalize_text(safe_payload.get('gateway'), max_length=120),
                        transaction_at,
                        transaction_date,
                        _normalize_text(safe_payload.get('accountNumber'), max_length=80),
                        _normalize_text(safe_payload.get('subAccount'), max_length=80),
                        _normalize_text(safe_payload.get('code'), max_length=120),
                        _normalize_text(safe_payload.get('content'), max_length=2000) or None,
                        _normalize_text(safe_payload.get('transferType'), max_length=32),
                        _normalize_text(safe_payload.get('description'), max_length=2000) or None,
                        _normalize_integer(safe_payload.get('transferAmount')),
                        _normalize_integer(safe_payload.get('accumulated')),
                        _normalize_text(safe_payload.get('referenceCode'), max_length=160),
                        payload_json,
                        safe_created_at,
                    ),
                )
                cursor.execute('SELECT * FROM iap_bank_hook_history WHERE id = LAST_INSERT_ID() LIMIT 1')
                return _row_to_bank_hook_history(cursor.fetchone())
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to record IAP bank hook history') from error


def list_iap_bank_hook_history_page(page=1, page_size=20, search_term='', start_date='', end_date=''):
    ensure_iap_bank_hook_history_schema()
    driver = _require_driver()
    safe_page, safe_page_size = _normalize_pagination(page, page_size)
    where_clause, where_params, safe_search_term, safe_start_at, safe_end_at = _build_history_filters(
        search_term=search_term,
        start_date=start_date,
        end_date=end_date,
    )
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(f'SELECT COUNT(*) AS total_items FROM iap_bank_hook_history{where_clause}', where_params)
                total_items = int((cursor.fetchone() or {}).get('total_items') or 0)
                pagination = _build_pagination(safe_page, safe_page_size, total_items)
                cursor.execute(
                    f"""
                    SELECT *
                    FROM iap_bank_hook_history{where_clause}
                    ORDER BY created_at DESC, id DESC
                    LIMIT %s OFFSET %s
                    """,
                    (*where_params, pagination['pageSize'], (pagination['page'] - 1) * pagination['pageSize']),
                )
                return {
                    'history': [_row_to_bank_hook_history(row) for row in cursor.fetchall() or []],
                    'pagination': pagination,
                    'search': safe_search_term,
                    'startDate': start_date if safe_start_at else '',
                    'endDate': end_date if safe_end_at else '',
                }
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list IAP bank hook history') from error