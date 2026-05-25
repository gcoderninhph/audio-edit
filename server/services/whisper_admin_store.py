import json
import os
import time
from threading import Lock
from urllib.parse import urlsplit, urlunsplit

try:
    from repositories.whisper_admin_repository import (
        WhisperAdminRepositoryError,
        count_whisper_queue_position_row,
        delete_whisper_processing_node_row,
        count_whisper_request_rows,
        ensure_whisper_admin_tables,
        insert_whisper_processing_node_row,
        list_processing_whisper_request_rows,
        list_whisper_processing_node_rows,
        list_whisper_request_rows,
        update_whisper_processing_node_row,
    )
    from repositories.whisper_config_repository import (
        WhisperConfigRepositoryError,
        ensure_whisper_config_table,
        get_whisper_service_config_row,
        upsert_whisper_service_config_row,
    )
    from utils.pagination import build_pagination, normalize_pagination
except ImportError:
    from ..repositories.whisper_admin_repository import (
        WhisperAdminRepositoryError,
        count_whisper_queue_position_row,
        delete_whisper_processing_node_row,
        count_whisper_request_rows,
        ensure_whisper_admin_tables,
        insert_whisper_processing_node_row,
        list_processing_whisper_request_rows,
        list_whisper_processing_node_rows,
        list_whisper_request_rows,
        update_whisper_processing_node_row,
    )
    from ..repositories.whisper_config_repository import (
        WhisperConfigRepositoryError,
        ensure_whisper_config_table,
        get_whisper_service_config_row,
        upsert_whisper_service_config_row,
    )
    from ..utils.pagination import build_pagination, normalize_pagination


DEFAULT_WHISPER_BASE_URL = 'http://whishper:8000'
DEFAULT_WHISPER_MAX_CONCURRENT_REQUESTS = max(1, min(20, int(os.environ.get('WHISPER_MAX_CONCURRENT_REQUESTS', '1') or '1')))
DEFAULT_WHISPER_DETECT_CREDIT_PER_MINUTE = float(os.environ.get('WHISPER_DETECT_CREDIT_PER_MINUTE', '20') or '20')
WHISPER_REQUEST_STATUS_OPTIONS = {'', 'queued', 'processing', 'running', 'success', 'failed'}

_schema_ready = False
_round_robin_index = 0
_round_robin_lock = Lock()


class WhisperAdminError(RuntimeError):
    pass


class WhisperAdminValidationError(WhisperAdminError):
    pass


class WhisperAdminNotFoundError(WhisperAdminError):
    pass


def normalize_whisper_base_url(raw_url):
    safe_url = str(raw_url or '').strip()
    if not safe_url:
        return ''

    parsed = urlsplit(safe_url)
    if parsed.scheme and parsed.netloc:
        safe_url = urlunsplit((parsed.scheme.lower(), parsed.netloc, parsed.path, '', '')).rstrip('/')
    else:
        safe_url = safe_url.rstrip('/')

    for suffix in ('/api/transcriptions', '/api/transcribe', '/transcribe'):
        if safe_url.endswith(suffix):
            safe_url = safe_url[:-len(suffix)]
            break

    return safe_url.rstrip('/')


def get_default_whisper_base_url():
    return normalize_whisper_base_url(os.environ.get('WHISPER_API_URL', DEFAULT_WHISPER_BASE_URL))


def get_default_whisper_max_concurrent_requests():
    return DEFAULT_WHISPER_MAX_CONCURRENT_REQUESTS


def _ensure_whisper_admin_schema():
    global _schema_ready
    if _schema_ready:
        return
    try:
        ensure_whisper_admin_tables()
    except WhisperAdminRepositoryError as error:
        raise WhisperAdminError('Unable to initialize Whisper admin storage') from error
    _schema_ready = True


def _normalize_request_status(status):
    safe_status = str(status or '').strip().lower()
    if safe_status == 'running':
        return 'processing'
    return safe_status if safe_status in WHISPER_REQUEST_STATUS_OPTIONS else ''


def _normalize_runtime_status(status):
    safe_status = str(status or '').strip().lower()
    if safe_status == 'running':
        return 'processing'
    if safe_status in {'queued', 'processing', 'success', 'failed'}:
        return safe_status
    return 'processing'


def _normalize_max_concurrent_requests(value):
    try:
        safe_value = int(value or 1)
    except (TypeError, ValueError):
        raise WhisperAdminValidationError('Max concurrent requests must be a whole number.') from None
    if safe_value < 1 or safe_value > 20:
        raise WhisperAdminValidationError('Max concurrent requests must be between 1 and 20.')
    return safe_value


def _normalize_detect_credit_per_minute(value):
    try:
        safe_value = float(value)
    except (TypeError, ValueError):
        raise WhisperAdminValidationError('Detect credit per minute must be a number.') from None
    if safe_value < 0 or safe_value > 100000:
        raise WhisperAdminValidationError('Detect credit per minute must be between 0 and 100000.')
    return safe_value


def _normalize_node_name(value):
    safe_value = ' '.join(str(value or '').split()).strip()
    if not safe_value:
        raise WhisperAdminValidationError('Please enter a Whisper node name.')
    if len(safe_value) > 120:
        raise WhisperAdminValidationError('Whisper node name must be 120 characters or fewer.')
    return safe_value


def _processing_counts_by_node_url(limit=500):
    try:
        rows = list_processing_whisper_request_rows(limit=max(1, int(limit or 500)))
    except WhisperAdminRepositoryError as error:
        raise WhisperAdminError('Unable to list Whisper processing nodes') from error

    counts = {}
    for row in rows:
        details_json = row.get('details_json')
        try:
            details = json.loads(details_json) if details_json else {}
        except json.JSONDecodeError:
            details = {}
        node_url = resolve_whisper_base_url_for_status(details)
        if not node_url:
            continue
        counts[node_url] = counts.get(node_url, 0) + 1
    return counts


def _row_to_request(row):
    details_json = row.get('details_json')
    try:
        details = json.loads(details_json) if details_json else {}
    except json.JSONDecodeError:
        details = {}

    normalized_status = _normalize_runtime_status(row.get('status') or '')
    node_base_url = resolve_whisper_base_url_for_status(details)
    provider_request_id = str(details.get('providerRequestId') or '').strip()

    return {
        'details': details,
        'id': row.get('request_id') or '',
        'nodeBaseUrl': node_base_url,
        'provider': row.get('provider') or '',
        'providerRequestId': provider_request_id,
        'requestId': row.get('request_id') or '',
        'requestType': row.get('request_type') or '',
        'queuePosition': 0,
        'sourceFileName': row.get('source_file_name') or '',
        'status': normalized_status,
        'updatedAt': float(row.get('updated_at') or 0),
        'userId': row.get('user_id') or '',
        'createdAt': float(row.get('created_at') or 0),
    }


def _row_to_node(row, processing_count=0):
    max_concurrent_requests = int(row.get('max_concurrent_requests') or 1)
    available_capacity = max(0, max_concurrent_requests - int(processing_count or 0))
    return {
        'availableCapacity': available_capacity,
        'createdAt': float(row.get('created_at') or 0),
        'id': int(row.get('node_id') or 0),
        'maxConcurrentRequests': max_concurrent_requests,
        'name': str(row.get('node_name') or row.get('node_url') or '').strip(),
        'processingCount': int(processing_count or 0),
        'updatedAt': float(row.get('updated_at') or 0),
        'url': row.get('node_url') or '',
    }


def list_whisper_requests_page(status='', page=1, page_size=20):
    _ensure_whisper_admin_schema()
    safe_status = _normalize_request_status(status)
    safe_page, safe_page_size = normalize_pagination(page, page_size, default_page_size=20, max_page_size=100)
    try:
        total_items = count_whisper_request_rows(safe_status)
        pagination = build_pagination(safe_page, safe_page_size, total_items)
        current_page = pagination['page']
        rows = list_whisper_request_rows(safe_status, safe_page_size, (current_page - 1) * safe_page_size)
    except WhisperAdminRepositoryError as error:
        raise WhisperAdminError('Unable to list Whisper requests') from error

    requests = []
    for row in rows:
        request_record = _row_to_request(row)
        if request_record['status'] == 'queued':
            try:
                request_record['queuePosition'] = count_whisper_queue_position_row(request_record['requestId'])
            except WhisperAdminRepositoryError:
                request_record['queuePosition'] = 0
        requests.append(request_record)

    return {
        'pagination': pagination,
        'requests': requests,
    }


def get_whisper_service_config():
    _ensure_whisper_admin_schema()
    try:
        ensure_whisper_config_table()
        row = get_whisper_service_config_row()
    except WhisperConfigRepositoryError as error:
        raise WhisperAdminError('Unable to load Whisper config') from error
    raw_rate = (row or {}).get('detect_credit_per_minute') if row else None
    return {
        'detectCreditPerMinute': max(0.0, float(DEFAULT_WHISPER_DETECT_CREDIT_PER_MINUTE if raw_rate is None else raw_rate)),
    }


def update_whisper_service_config(payload):
    _ensure_whisper_admin_schema()
    payload = payload if isinstance(payload, dict) else {}
    current_config = get_whisper_service_config()
    next_config = {
        'detectCreditPerMinute': _normalize_detect_credit_per_minute(payload.get('detectCreditPerMinute', current_config['detectCreditPerMinute'])),
    }
    try:
        ensure_whisper_config_table()
        upsert_whisper_service_config_row(next_config, time.time())
    except WhisperConfigRepositoryError as error:
        raise WhisperAdminError('Unable to update Whisper config') from error
    return get_whisper_service_config()


def list_whisper_processing_nodes():
    _ensure_whisper_admin_schema()
    try:
        rows = list_whisper_processing_node_rows()
    except WhisperAdminRepositoryError as error:
        raise WhisperAdminError('Unable to list Whisper processing nodes') from error
    processing_counts = _processing_counts_by_node_url()
    return [_row_to_node(row, processing_counts.get(row.get('node_url') or '', 0)) for row in rows]


def list_whisper_dispatch_nodes():
    configured_nodes = list_whisper_processing_nodes()
    if configured_nodes:
        return sorted(
            configured_nodes,
            key=lambda node: (int(node.get('processingCount') or 0), -float(node.get('updatedAt') or 0), int(node.get('id') or 0)),
        )

    default_url = get_default_whisper_base_url()
    processing_count = _processing_counts_by_node_url().get(default_url, 0)
    return [{
        'availableCapacity': max(0, get_default_whisper_max_concurrent_requests() - processing_count),
        'createdAt': 0.0,
        'id': 0,
        'maxConcurrentRequests': get_default_whisper_max_concurrent_requests(),
        'processingCount': processing_count,
        'updatedAt': 0.0,
        'url': default_url,
    }]


def list_whisper_processing_node_urls():
    return [node['url'] for node in list_whisper_processing_nodes() if node.get('url')]


def create_whisper_processing_node(payload):
    _ensure_whisper_admin_schema()
    raw_name = ''
    raw_url = ''
    raw_max_concurrent_requests = 1
    if isinstance(payload, dict):
        raw_name = payload.get('name') or payload.get('nodeName') or ''
        raw_url = payload.get('url') or payload.get('nodeUrl') or ''
        raw_max_concurrent_requests = payload.get('maxConcurrentRequests') or payload.get('max_concurrent_requests') or 1

    normalized_name = _normalize_node_name(raw_name)
    normalized_url = normalize_whisper_base_url(raw_url)
    if not normalized_url:
        raise WhisperAdminValidationError('Please enter a Whisper node URL.')

    parsed = urlsplit(normalized_url)
    if parsed.scheme not in {'http', 'https'} or not parsed.netloc:
        raise WhisperAdminValidationError('Whisper node URL must start with http:// or https:// and include a host.')

    max_concurrent_requests = _normalize_max_concurrent_requests(raw_max_concurrent_requests)
    try:
        existing_rows = list_whisper_processing_node_rows()
    except WhisperAdminRepositoryError as error:
        raise WhisperAdminError('Unable to create Whisper processing node') from error

    existing_urls = {str(row.get('node_url') or '').lower() for row in existing_rows}
    if normalized_url.lower() in existing_urls:
        raise WhisperAdminValidationError('This Whisper node URL already exists.')

    now = time.time()
    try:
        insert_whisper_processing_node_row(normalized_name, normalized_url, max_concurrent_requests, now, now)
    except WhisperAdminRepositoryError as error:
        raise WhisperAdminError('Unable to create Whisper processing node') from error

    return {
        'availableCapacity': max_concurrent_requests,
        'createdAt': now,
        'maxConcurrentRequests': max_concurrent_requests,
        'name': normalized_name,
        'processingCount': 0,
        'updatedAt': now,
        'url': normalized_url,
    }


def update_whisper_processing_node(node_id, payload):
    _ensure_whisper_admin_schema()
    safe_node_id = int(node_id or 0)
    if safe_node_id <= 0:
        raise WhisperAdminNotFoundError('Whisper node was not found.')

    try:
        existing_rows = list_whisper_processing_node_rows()
    except WhisperAdminRepositoryError as error:
        raise WhisperAdminError('Unable to update Whisper processing node') from error

    existing_row = next((row for row in existing_rows if int(row.get('node_id') or 0) == safe_node_id), None)
    if existing_row is None:
        raise WhisperAdminNotFoundError('Whisper node was not found.')

    payload = payload if isinstance(payload, dict) else {}
    current_name = str(existing_row.get('node_name') or existing_row.get('node_url') or '').strip()
    current_url = normalize_whisper_base_url(existing_row.get('node_url') or '')
    current_max_concurrent_requests = int(existing_row.get('max_concurrent_requests') or 1)

    normalized_name = _normalize_node_name(payload.get('name', payload.get('nodeName', current_name)))
    normalized_url = normalize_whisper_base_url(payload.get('url', payload.get('nodeUrl', current_url)))
    if not normalized_url:
        raise WhisperAdminValidationError('Please enter a Whisper node URL.')

    parsed = urlsplit(normalized_url)
    if parsed.scheme not in {'http', 'https'} or not parsed.netloc:
        raise WhisperAdminValidationError('Whisper node URL must start with http:// or https:// and include a host.')

    max_concurrent_requests = _normalize_max_concurrent_requests(
        payload.get('maxConcurrentRequests', payload.get('max_concurrent_requests', current_max_concurrent_requests))
    )

    duplicate_rows = {
        str(row.get('node_url') or '').lower(): int(row.get('node_id') or 0)
        for row in existing_rows
    }
    duplicate_node_id = duplicate_rows.get(normalized_url.lower())
    if duplicate_node_id and duplicate_node_id != safe_node_id:
        raise WhisperAdminValidationError('This Whisper node URL already exists.')

    processing_counts = _processing_counts_by_node_url()
    if normalized_url.lower() != current_url.lower() and int(processing_counts.get(current_url, 0) or 0) > 0:
        raise WhisperAdminValidationError('Cannot change the node URL while the node is processing requests.')

    updated_at = time.time()
    try:
        updated = update_whisper_processing_node_row(
            safe_node_id,
            normalized_name,
            normalized_url,
            max_concurrent_requests,
            updated_at,
        )
    except WhisperAdminRepositoryError as error:
        raise WhisperAdminError('Unable to update Whisper processing node') from error

    if not updated:
        raise WhisperAdminNotFoundError('Whisper node was not found.')

    processing_count = int(processing_counts.get(current_url if normalized_url.lower() == current_url.lower() else normalized_url, 0) or 0)
    return {
        'availableCapacity': max(0, max_concurrent_requests - processing_count),
        'createdAt': float(existing_row.get('created_at') or 0),
        'id': safe_node_id,
        'maxConcurrentRequests': max_concurrent_requests,
        'name': normalized_name,
        'processingCount': processing_count,
        'updatedAt': updated_at,
        'url': normalized_url,
    }


def delete_whisper_processing_node(node_id):
    _ensure_whisper_admin_schema()
    safe_node_id = int(node_id or 0)
    if safe_node_id <= 0:
        raise WhisperAdminNotFoundError('Whisper node was not found.')

    try:
        existing_rows = list_whisper_processing_node_rows()
    except WhisperAdminRepositoryError as error:
        raise WhisperAdminError('Unable to delete Whisper processing node') from error

    existing_row = next((row for row in existing_rows if int(row.get('node_id') or 0) == safe_node_id), None)
    if existing_row is None:
        raise WhisperAdminNotFoundError('Whisper node was not found.')

    current_url = normalize_whisper_base_url(existing_row.get('node_url') or '')
    processing_count = int(_processing_counts_by_node_url().get(current_url, 0) or 0)
    if processing_count > 0:
        raise WhisperAdminValidationError('Cannot delete the node while it is processing requests.')

    try:
        deleted = delete_whisper_processing_node_row(safe_node_id)
    except WhisperAdminRepositoryError as error:
        raise WhisperAdminError('Unable to delete Whisper processing node') from error

    if not deleted:
        raise WhisperAdminNotFoundError('Whisper node was not found.')

    return {
        'deleted': True,
        'id': safe_node_id,
    }


def select_whisper_base_url_for_new_request():
    try:
        nodes = list_whisper_dispatch_nodes()
    except WhisperAdminError:
        return get_default_whisper_base_url()

    if not nodes:
        return get_default_whisper_base_url()

    global _round_robin_index
    with _round_robin_lock:
        selected_node = nodes[_round_robin_index % len(nodes)]
        _round_robin_index = (_round_robin_index + 1) % len(nodes)
    return selected_node.get('url') or get_default_whisper_base_url()


def resolve_whisper_base_url_for_status(request_details):
    stored_url = normalize_whisper_base_url((request_details or {}).get('nodeBaseUrl') or '')
    if stored_url:
        return stored_url
    return get_default_whisper_base_url()