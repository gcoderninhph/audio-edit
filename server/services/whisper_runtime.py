import json
import logging
import threading
import time
import uuid
from pathlib import Path
import requests
try:
    from repositories.whisper_admin_repository import (
        WhisperAdminRepositoryError,
        acquire_whisper_named_lock,
        count_whisper_queue_position_row,
        list_processing_whisper_request_rows,
        list_queued_whisper_request_rows,
        release_whisper_named_lock,
    )
    from services.request_store import RequestStoreError, get_request_record, save_request_record
    from services.whisper_admin_store import list_whisper_dispatch_nodes, resolve_whisper_base_url_for_status
    from services.whisper_runtime_status import (
        WHISPER_STATUS_FAILED,
        WHISPER_STATUS_PROCESSING,
        WHISPER_STATUS_QUEUED,
        WHISPER_STATUS_SUCCESS,
        normalize_whisper_provider_job_status,
        normalize_whisper_runtime_status,
        read_whisper_request_details,
    )
    from utils.proxy_route_helpers import first_payload_value, read_response_payload
except ImportError:
    from ..repositories.whisper_admin_repository import (
        WhisperAdminRepositoryError,
        acquire_whisper_named_lock,
        count_whisper_queue_position_row,
        list_processing_whisper_request_rows,
        list_queued_whisper_request_rows,
        release_whisper_named_lock,
    )
    from .request_store import RequestStoreError, get_request_record, save_request_record
    from .whisper_admin_store import list_whisper_dispatch_nodes, resolve_whisper_base_url_for_status
    from .whisper_runtime_status import (
        WHISPER_STATUS_FAILED,
        WHISPER_STATUS_PROCESSING,
        WHISPER_STATUS_QUEUED,
        WHISPER_STATUS_SUCCESS,
        normalize_whisper_provider_job_status,
        normalize_whisper_runtime_status,
        read_whisper_request_details,
    )
    from ..utils.proxy_route_helpers import first_payload_value, read_response_payload
WHISPER_RUNTIME_LOCK_NAME = 'whisper-runtime-dispatch'
WHISPER_WORKER_INTERVAL_SECONDS = 3
WHISPER_QUEUE_ROOT = Path(__file__).resolve().parents[1] / 'uploads' / 'whisper-queue'
_worker_started = False
_worker_start_lock = threading.Lock()


class WhisperRuntimeError(RuntimeError):
    pass


def _ensure_queue_root():
    WHISPER_QUEUE_ROOT.mkdir(parents=True, exist_ok=True)


def _request_file_name(file_storage):
    return Path(str(getattr(file_storage, 'filename', '') or 'audio-upload.bin')).name or 'audio-upload.bin'


def _queue_file_path(request_id, file_name):
    request_dir = WHISPER_QUEUE_ROOT / request_id
    request_dir.mkdir(parents=True, exist_ok=True)
    return request_dir / file_name


def _generate_request_id():
    return f'whisper-{int(time.time() * 1000)}-{uuid.uuid4().hex[:10]}'


def _store_queue_file(request_id, file_storage):
    _ensure_queue_root()
    file_name = _request_file_name(file_storage)
    file_path = _queue_file_path(request_id, file_name)
    file_storage.save(file_path)
    return str(file_path), file_name


def _cleanup_queue_file(details):
    temp_file_path = Path(str((details or {}).get('tempFilePath') or '')).resolve() if (details or {}).get('tempFilePath') else None
    if not temp_file_path:
        return
    try:
        if temp_file_path.exists():
            temp_file_path.unlink()
        request_dir = temp_file_path.parent
        if request_dir.exists() and request_dir.is_dir() and not any(request_dir.iterdir()):
            request_dir.rmdir()
    except OSError:
        return


def _persist_request_record(request_record):
    try:
        save_request_record(request_record)
        return None
    except RequestStoreError as error:
        raise WhisperRuntimeError('Request database is unavailable') from error


def _update_request_record(stored_request, *, status=None, details=None, output_file_name=None):
    merged_details = dict(read_whisper_request_details(stored_request))
    if details:
        merged_details.update(details)
    updated_record = {
        'request_id': stored_request['request_id'],
        'user_id': stored_request['user_id'],
        'request_type': stored_request.get('request_type') or 'transcription',
        'provider': stored_request.get('provider') or 'whisper',
        'status': status or stored_request.get('status') or WHISPER_STATUS_PROCESSING,
        'source_file_name': stored_request.get('source_file_name'),
        'target_language': stored_request.get('target_language'),
        'output_file_name': output_file_name if output_file_name is not None else stored_request.get('output_file_name'),
        'details': merged_details,
        'created_at': stored_request.get('created_at') or time.time(),
        'updated_at': time.time(),
    }
    _persist_request_record(updated_record)
    return updated_record


def _request_queue_position(request_id):
    try:
        return count_whisper_queue_position_row(request_id)
    except WhisperAdminRepositoryError:
        return 0


def build_transcription_status_payload(stored_request):
    details = read_whisper_request_details(stored_request)
    request_id = stored_request.get('request_id') or ''
    status = normalize_whisper_runtime_status(stored_request.get('status') or '')
    payload = {
        'id': request_id,
        'requestId': request_id,
        'providerRequestId': str(details.get('providerRequestId') or '').strip(),
        'nodeBaseUrl': resolve_whisper_base_url_for_status(details),
        'queuePosition': _request_queue_position(request_id) if status == WHISPER_STATUS_QUEUED else 0,
        'state': status,
    }

    if status == WHISPER_STATUS_SUCCESS:
        result_payload = details.get('result') if isinstance(details.get('result'), dict) else {}
        payload['status'] = 2
        payload['result'] = result_payload
        if isinstance(result_payload.get('segments'), list):
            payload['segments'] = result_payload.get('segments')
        return payload

    if status == WHISPER_STATUS_FAILED:
        payload['status'] = -1
        payload['error'] = str(details.get('errorMessage') or 'Whisper job failed').strip() or 'Whisper job failed'
        return payload

    payload['status'] = 1
    return payload


def _read_request_record(request_id):
    try:
        return get_request_record(request_id)
    except RequestStoreError as error:
        raise WhisperRuntimeError('Request database is unavailable') from error


def _lock_whisper_runtime(timeout_seconds=0):
    try:
        return acquire_whisper_named_lock(WHISPER_RUNTIME_LOCK_NAME, timeout_seconds)
    except WhisperAdminRepositoryError as error:
        raise WhisperRuntimeError('Unable to acquire Whisper dispatch lock') from error


def _unlock_whisper_runtime(lock_connection):
    release_whisper_named_lock(lock_connection, WHISPER_RUNTIME_LOCK_NAME)


def _submit_request_to_node(stored_request, node):
    details = read_whisper_request_details(stored_request)
    temp_file_path = Path(str(details.get('tempFilePath') or '')).resolve()
    if not temp_file_path.exists() or not temp_file_path.is_file():
        updated_request = _update_request_record(
            stored_request,
            status=WHISPER_STATUS_FAILED,
            details={'errorMessage': 'Queued Whisper file no longer exists on disk.'},
        )
        return updated_request

    node_base_url = str(node.get('url') or '').strip()
    request_details = {
        'dispatchAttemptedAt': time.time(),
        'lastDispatchError': '',
        'nodeBaseUrl': node_base_url,
    }
    request_payload = {
        'device': details.get('device') or 'cpu',
        'language': details.get('language') or 'auto',
        'model_size': details.get('modelSize') or 'base',
    }
    active_request = _update_request_record(
        stored_request,
        status=WHISPER_STATUS_PROCESSING,
        details={
            **request_details,
            'mode': 'dispatching',
            'providerStatus': 'dispatching',
        },
    )

    try:
        with temp_file_path.open('rb') as queued_file:
            response = requests.post(
                f'{node_base_url}/transcribe/',
                files={'file': (stored_request.get('source_file_name') or temp_file_path.name, queued_file, 'audio/mpeg')},
                data=request_payload,
                timeout=120,
            )
        response_payload = read_response_payload(response)
    except requests.RequestException as error:
        updated_request = _update_request_record(
            active_request,
            status=WHISPER_STATUS_QUEUED,
            details={**request_details, 'lastDispatchError': str(error)[:500]},
        )
        return updated_request

    if not response.ok:
        response_text = response.text or ''
        requeue_request = response.status_code in {429, 503}
        next_status = WHISPER_STATUS_QUEUED if requeue_request else WHISPER_STATUS_FAILED
        updated_request = _update_request_record(
            active_request,
            status=next_status,
            details={
                **request_details,
                'errorMessage': response_text[:1000] or 'Whisper node rejected the request.',
                'lastDispatchError': response_text[:500],
            },
        )
        if next_status == WHISPER_STATUS_FAILED:
            _cleanup_queue_file(updated_request.get('details'))
        return updated_request

    provider_request_id = first_payload_value(response_payload, ('id', 'jobId', 'requestId', 'request_id'))
    if not provider_request_id and isinstance(response_payload, dict) and isinstance(response_payload.get('segments'), list):
        updated_request = _update_request_record(
            active_request,
            status=WHISPER_STATUS_SUCCESS,
            details={
                **request_details,
                'mode': 'sync',
                'providerRequestId': '',
                'providerStatus': '2',
                'result': response_payload,
                'segmentCount': len(response_payload.get('segments') or []),
                'tempFilePath': '',
            },
        )
        _cleanup_queue_file(updated_request.get('details'))
        return updated_request

    if not provider_request_id:
        updated_request = _update_request_record(
            active_request,
            status=WHISPER_STATUS_FAILED,
            details={
                **request_details,
                'errorMessage': 'Whisper node did not return a job ID.',
                'lastDispatchError': 'Whisper node did not return a job ID.',
            },
        )
        _cleanup_queue_file(updated_request.get('details'))
        return updated_request

    updated_request = _update_request_record(
        active_request,
        status=WHISPER_STATUS_PROCESSING,
        details={
            **request_details,
            'mode': 'async',
            'providerRequestId': provider_request_id,
            'providerStatus': 'processing',
            'tempFilePath': '',
        },
    )
    _cleanup_queue_file(details)
    return updated_request


def _refresh_processing_request(stored_request):
    details = read_whisper_request_details(stored_request)
    provider_request_id = str(details.get('providerRequestId') or '').strip()
    if not provider_request_id:
        dispatch_mode = str(details.get('mode') or '').strip().lower()
        if dispatch_mode == 'dispatching' or details.get('tempFilePath'):
            return stored_request
        provider_request_id = str(stored_request.get('request_id') or '').strip()
    if not provider_request_id:
        return stored_request

    node_base_url = resolve_whisper_base_url_for_status(details)
    try:
        response = requests.get(f'{node_base_url}/api/transcriptions/{provider_request_id}', timeout=30)
    except requests.RequestException:
        return stored_request

    if response.status_code == 404:
        return _update_request_record(
            stored_request,
            status=WHISPER_STATUS_FAILED,
            details={'errorMessage': 'Whisper provider job was not found.'},
        )

    if not response.ok:
        return stored_request

    response_payload = read_response_payload(response)
    raw_status = first_payload_value(response_payload, ('status', 'state', 'jobStatus', 'taskStatus'))
    normalized_status = normalize_whisper_provider_job_status(raw_status)
    updated_details = {'providerStatus': raw_status or details.get('providerStatus') or 'processing'}

    if normalized_status == WHISPER_STATUS_SUCCESS:
        updated_details['result'] = response_payload if isinstance(response_payload, dict) else {}
        updated_details['hasDownloadUrl'] = bool((response_payload or {}).get('download_url') or (response_payload or {}).get('downloadUrl')) if isinstance(response_payload, dict) else False
        return _update_request_record(stored_request, status=WHISPER_STATUS_SUCCESS, details=updated_details)

    if normalized_status == WHISPER_STATUS_FAILED:
        error_message = ''
        if isinstance(response_payload, dict):
            error_message = str(response_payload.get('error') or response_payload.get('message') or '').strip()
        updated_details['errorMessage'] = error_message or 'Whisper job failed.'
        return _update_request_record(stored_request, status=WHISPER_STATUS_FAILED, details=updated_details)

    return _update_request_record(stored_request, status=WHISPER_STATUS_PROCESSING, details=updated_details)


def _run_runtime_cycle(limit=50, preferred_request_id=''):
    nodes = list_whisper_dispatch_nodes()
    if not nodes:
        return []

    queued_rows = list_queued_whisper_request_rows(limit=max(1, int(limit or 50)))
    if preferred_request_id:
        queued_rows.sort(key=lambda row: 0 if (row.get('request_id') or '') == preferred_request_id else 1)

    queued_request_ids = [row.get('request_id') or '' for row in queued_rows if row.get('request_id')]
    queue_index = 0
    claimed_requests = []
    for node in nodes:
        available_capacity = int(node.get('availableCapacity') or 0)
        if available_capacity <= 0:
            continue
        for _ in range(available_capacity):
            if queue_index >= len(queued_request_ids):
                return claimed_requests
            request_record = _read_request_record(queued_request_ids[queue_index])
            queue_index += 1
            if not request_record or normalize_whisper_runtime_status(request_record.get('status') or '') != WHISPER_STATUS_QUEUED:
                continue
            claimed_requests.append((_update_request_record(
                request_record,
                status=WHISPER_STATUS_PROCESSING,
                details={
                    'dispatchAttemptedAt': time.time(),
                    'lastDispatchError': '',
                    'nodeBaseUrl': str(node.get('url') or '').strip(),
                    'mode': 'dispatching',
                    'providerStatus': 'dispatching',
                },
            ), node))
    return claimed_requests


def create_transcription_request(file_storage, user_id):
    request_id = _generate_request_id()
    temp_file_path = ''
    source_file_name = ''
    try:
        temp_file_path, source_file_name = _store_queue_file(request_id, file_storage)
        request_record = {
            'request_id': request_id,
            'user_id': user_id,
            'request_type': 'transcription',
            'provider': 'whisper',
            'status': WHISPER_STATUS_QUEUED,
            'source_file_name': source_file_name,
            'target_language': None,
            'output_file_name': None,
            'details': {
                'device': 'cpu',
                'language': 'auto',
                'modelSize': 'base',
                'providerRequestId': '',
                'queueEnteredAt': time.time(),
                'tempFilePath': temp_file_path,
            },
            'created_at': time.time(),
            'updated_at': time.time(),
        }
        _persist_request_record(request_record)
        dispatch_queued_whisper_requests(limit=1, preferred_request_id=request_id)
        return _read_request_record(request_id)
    except OSError as error:
        if temp_file_path:
            _cleanup_queue_file({'tempFilePath': temp_file_path})
        raise WhisperRuntimeError(f'Unable to store the queued Whisper file: {error}') from error


def get_transcription_request_for_status(request_id):
    request_record = _read_request_record(request_id)
    if not request_record:
        return None
    normalized_status = normalize_whisper_runtime_status(request_record.get('status') or '')
    if normalized_status == WHISPER_STATUS_QUEUED:
        dispatch_queued_whisper_requests(limit=1, preferred_request_id=request_id)
    elif normalized_status == WHISPER_STATUS_PROCESSING:
        request_record = _refresh_processing_request(request_record)
    return _read_request_record(request_id) or request_record


def dispatch_queued_whisper_requests(limit=50, preferred_request_id=''):
    for processing_request in list_processing_whisper_request_rows(limit=max(1, int(limit or 50))):
        request_record = _read_request_record(processing_request.get('request_id') or '')
        if request_record:
            _refresh_processing_request(request_record)

    lock_connection = _lock_whisper_runtime(timeout_seconds=1)
    if lock_connection is None:
        return {'dispatched': 0, 'reason': 'locked'}
    try:
        claimed_requests = _run_runtime_cycle(limit=limit, preferred_request_id=preferred_request_id)
    finally:
        _unlock_whisper_runtime(lock_connection)

    for request_record, node in claimed_requests:
        _submit_request_to_node(request_record, node)
    return {'dispatched': len(claimed_requests)}


def _worker_loop():
    logger = logging.getLogger(__name__)
    while True:
        try:
            dispatch_queued_whisper_requests(limit=50)
        except Exception as error:  # pragma: no cover - defensive background logging
            logger.warning('Unable to dispatch queued Whisper requests: %s', error)
        time.sleep(WHISPER_WORKER_INTERVAL_SECONDS)


def start_whisper_dispatch_worker():
    global _worker_started
    with _worker_start_lock:
        if _worker_started: return
        thread = threading.Thread(target=_worker_loop, name='whisper-dispatch', daemon=True)
        thread.start()
        _worker_started = True