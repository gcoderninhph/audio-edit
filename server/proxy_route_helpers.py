from flask import Response, jsonify
import json
import os
import time

try:
    from request_store import RequestStoreError, get_request_record, save_request_record
    from translation_fallback import create_local_translation_job
except ImportError:
    from .request_store import RequestStoreError, get_request_record, save_request_record
    from .translation_fallback import create_local_translation_job


VBEE_ROUTER_API_URL = os.environ.get('VBEE_ROUTER_API_URL', 'http://localhost:3020').rstrip('/')


def build_vbee_router_url(path):
    return f"{VBEE_ROUTER_API_URL}/public/{path.lstrip('/')}"


def build_proxy_response(response, fallback_message):
    payload = response.content
    if payload:
        return Response(
            payload,
            status=response.status_code,
            content_type=response.headers.get('Content-Type', 'application/json'),
        )

    return jsonify({'error': fallback_message}), response.status_code


def build_json_success_response(response_payload, status_code, **extra_fields):
    payload = dict(response_payload or {}) if isinstance(response_payload, dict) else {}
    for field_name, field_value in extra_fields.items():
        if field_value is not None:
            payload[field_name] = field_value
    return jsonify(payload), status_code


def should_use_local_translation_fallback(response=None, error=None):
    if error is not None:
        return True

    if response is None:
        return False

    response_text = (response.text or '').lower()
    return response.status_code >= 500 \
        or response.status_code == 503 \
        or 'managed worker' in response_text \
        or 'api key' in response_text


def get_claim_user_id(claims):
    return str(claims.get('sub') or '').strip()


def read_response_payload(response):
    try:
        return response.json()
    except (ValueError, json.JSONDecodeError):
        return None


def first_payload_value(payload, keys):
    if not isinstance(payload, dict):
        return ''
    for key in keys:
        if key not in payload:
            continue
        value = payload.get(key)
        if value is not None and str(value).strip() != '':
            return str(value)
    return ''


def save_server_request(request_id, user_id, request_type, provider, **metadata):
    if not request_id:
        return None

    now = time.time()
    try:
        save_request_record({
            'request_id': request_id,
            'user_id': user_id,
            'request_type': request_type,
            'provider': provider,
            'status': metadata.get('status') or 'running',
            'source_file_name': metadata.get('source_file_name'),
            'target_language': metadata.get('target_language'),
            'output_file_name': metadata.get('output_file_name'),
            'details': metadata.get('details') or {},
            'created_at': now,
            'updated_at': now,
        })
        return None
    except RequestStoreError:
        return jsonify({'error': 'Request database is unavailable'}), 503


def normalize_server_request_status(raw_status, request_type):
    status = str(raw_status or '').strip().lower()
    if request_type == 'transcription' and status == '2':
        return 'success'
    if status in {'2', 'success', 'succeeded', 'complete', 'completed', 'finished', 'done'}:
        return 'success'
    if status in {'-1', 'failed', 'failure', 'error', 'errored', 'cancelled', 'canceled'}:
        return 'failed'
    return 'running'


def sync_server_request_status(stored_request, response_payload, request_type):
    raw_status = first_payload_value(response_payload, ('status', 'state', 'jobStatus', 'taskStatus'))
    if not raw_status:
        return None

    details = dict(stored_request.get('details') or {})
    details['providerStatus'] = raw_status
    if isinstance(response_payload, dict):
        details['hasDownloadUrl'] = bool(response_payload.get('download_url') or response_payload.get('downloadUrl'))

    try:
        save_request_record({
            'request_id': stored_request['request_id'],
            'user_id': stored_request['user_id'],
            'request_type': stored_request.get('request_type') or request_type,
            'provider': stored_request.get('provider') or '',
            'status': normalize_server_request_status(raw_status, request_type),
            'source_file_name': stored_request.get('source_file_name'),
            'target_language': stored_request.get('target_language'),
            'output_file_name': first_payload_value(response_payload, ('outputFileName', 'output_file_name', 'fileName'))
                or stored_request.get('output_file_name'),
            'details': details,
            'created_at': stored_request.get('created_at') or time.time(),
            'updated_at': time.time(),
        })
        return None
    except RequestStoreError:
        return jsonify({'error': 'Request database is unavailable'}), 503


def require_request_owner(request_id, claims):
    try:
        stored_request = get_request_record(request_id)
    except RequestStoreError:
        return None, (jsonify({'error': 'Request database is unavailable'}), 503)

    if not stored_request or stored_request.get('user_id') != get_claim_user_id(claims):
        return None, (jsonify({'error': 'Request not found'}), 404)

    return stored_request, None


def build_local_translation_response(file_bytes, file_name, target_language, user_id, **extra_fields):
    try:
        payload = create_local_translation_job(file_bytes, file_name, target_language, user_id)
        if isinstance(payload, dict):
            payload = {
                **payload,
                **{field_name: field_value for field_name, field_value in extra_fields.items() if field_value is not None},
            }
        return jsonify(payload), 202
    except RequestStoreError:
        return jsonify({'error': 'Translation request database is unavailable'}), 503
