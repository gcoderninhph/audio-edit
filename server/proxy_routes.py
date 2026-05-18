from flask import Response, jsonify, request
import io
import json
import os
import requests
import time
from urllib.parse import urlparse

try:
    from auth_routes import require_access_token
    from request_store import RequestStoreError, get_request_record, save_request_record
    from translation_fallback import (
        create_local_translation_job,
        get_local_translation_download,
        get_local_translation_status,
        is_local_translation_job,
        RequestStoreError,
    )
except ImportError:
    from .auth_routes import require_access_token
    from .request_store import RequestStoreError, get_request_record, save_request_record
    from .translation_fallback import (
        create_local_translation_job,
        get_local_translation_download,
        get_local_translation_status,
        is_local_translation_job,
        RequestStoreError,
    )

WHISPER_API_URL = "http://localhost:8081/api/transcriptions"
LLM_SUBTRANS_API_URL = "http://localhost:8090/api"
VBEE_ROUTER_API_URL = os.environ.get('VBEE_ROUTER_API_URL', 'http://localhost:3020').rstrip('/')


def build_vbee_router_url(path):
    return f"{VBEE_ROUTER_API_URL}/public/{path.lstrip('/')}"


def build_proxy_response(response, fallback_message):
    payload = response.content
    if payload:
        return Response(
            payload,
            status=response.status_code,
            content_type=response.headers.get('Content-Type', 'application/json')
        )

    return jsonify({'error': fallback_message}), response.status_code


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


def build_local_translation_response(file_bytes, file_name, target_language, user_id):
    try:
        return jsonify(create_local_translation_job(file_bytes, file_name, target_language, user_id)), 202
    except RequestStoreError:
        return jsonify({'error': 'Translation request database is unavailable'}), 503


def register_proxy_routes(app):
    @app.route('/api/transcription/start', methods=['POST'])
    def start_transcription():
        claims, auth_error = require_access_token()
        if auth_error:
            return auth_error

        if 'file' not in request.files:
            return jsonify({'error': 'No file part'}), 400

        file = request.files['file']
        files = {'file': (file.filename, file.stream, file.mimetype)}
        data = {
            'modelSize': 'base',
            'language': 'auto',
            'device': 'cpu'
        }

        try:
            response = requests.post(WHISPER_API_URL, files=files, data=data)
            response_payload = read_response_payload(response)
            if response.ok:
                request_id = first_payload_value(response_payload, ('id', 'jobId', 'requestId', 'request_id'))
                request_error = save_server_request(
                    request_id,
                    get_claim_user_id(claims),
                    'transcription',
                    'whisper',
                    source_file_name=file.filename,
                    details={'modelSize': data['modelSize'], 'language': data['language'], 'device': data['device']},
                )
                if request_error:
                    return request_error
            return build_proxy_response(response, 'Failed to communicate with Whisper API')
        except requests.RequestException as error:
            print(f"Whisper API error: {error}")
            return jsonify({'error': 'Failed to communicate with Whisper API'}), 502

    @app.route('/api/transcription/status/<string:job_id>', methods=['GET'])
    def get_transcription_status(job_id):
        claims, auth_error = require_access_token()
        if auth_error:
            return auth_error

        stored_request, owner_error = require_request_owner(job_id, claims)
        if owner_error:
            return owner_error

        try:
            response = requests.get(f"{WHISPER_API_URL}/{job_id}")
            if response.ok:
                request_error = sync_server_request_status(stored_request, read_response_payload(response), 'transcription')
                if request_error:
                    return request_error
            return build_proxy_response(response, 'Failed to communicate with Whisper API')
        except requests.RequestException as error:
            print(f"Whisper API error: {error}")
            return jsonify({'error': 'Failed to communicate with Whisper API'}), 502

    @app.route('/api/translation/start', methods=['POST'])
    def start_translation():
        claims, auth_error = require_access_token()
        if auth_error:
            return auth_error

        if 'subtitle_file' not in request.files:
            return jsonify({'error': 'No subtitle_file part'}), 400
        if 'target_language' not in request.form:
            return jsonify({'error': 'No target_language specified'}), 400

        file = request.files['subtitle_file']
        target_language = request.form['target_language']
        file_bytes = file.read()
        if not file_bytes:
            return jsonify({'error': 'Subtitle file is empty'}), 400

        files = {'subtitle_file': (file.filename, io.BytesIO(file_bytes), file.mimetype or 'text/plain')}
        data = {'target_language': target_language}

        try:
            response = requests.post(f"{LLM_SUBTRANS_API_URL}/translate", files=files, data=data)
            if should_use_local_translation_fallback(response=response):
                return build_local_translation_response(file_bytes, file.filename, target_language, get_claim_user_id(claims))

            response_payload = read_response_payload(response)
            if response.ok:
                request_id = first_payload_value(response_payload, ('requestId', 'request_id', 'id', 'jobId'))
                output_file_name = first_payload_value(response_payload, ('outputFileName', 'output_file_name', 'fileName'))
                request_error = save_server_request(
                    request_id,
                    get_claim_user_id(claims),
                    'translation',
                    'llm-subtrans',
                    source_file_name=file.filename,
                    target_language=target_language,
                    output_file_name=output_file_name,
                    details={'localFallback': False},
                )
                if request_error:
                    return request_error
            return build_proxy_response(response, 'Failed to communicate with LLM-Subtrans API')
        except requests.RequestException as error:
            print(f"LLM-Subtrans API error: {error}")
            return build_local_translation_response(file_bytes, file.filename, target_language, get_claim_user_id(claims))

    @app.route('/api/translation/status/<string:job_id>', methods=['GET'])
    def get_translation_status(job_id):
        claims, auth_error = require_access_token()
        if auth_error:
            return auth_error

        stored_request, owner_error = require_request_owner(job_id, claims)
        if owner_error:
            return owner_error

        if is_local_translation_job(job_id):
            try:
                job_status = get_local_translation_status(job_id)
            except RequestStoreError:
                return jsonify({'error': 'Translation request database is unavailable'}), 503
            if not job_status:
                return jsonify({'error': 'Translation job not found'}), 404
            return jsonify(job_status), 200

        try:
            response = requests.get(f"{LLM_SUBTRANS_API_URL}/jobs/{job_id}")
            if response.ok:
                request_error = sync_server_request_status(stored_request, read_response_payload(response), 'translation')
                if request_error:
                    return request_error
            return build_proxy_response(response, 'Failed to communicate with LLM-Subtrans API')
        except requests.RequestException as error:
            print(f"LLM-Subtrans API error: {error}")
            return jsonify({'error': 'Failed to communicate with LLM-Subtrans API'}), 502

    @app.route('/api/translation/download/<string:job_id>/<string:file_name>', methods=['GET'])
    def download_translation(job_id, file_name):
        claims, auth_error = require_access_token()
        if auth_error:
            return auth_error

        _stored_request, owner_error = require_request_owner(job_id, claims)
        if owner_error:
            return owner_error

        if is_local_translation_job(job_id):
            try:
                local_download = get_local_translation_download(job_id, file_name)
            except RequestStoreError:
                return jsonify({'error': 'Translation request database is unavailable'}), 503
            if not local_download:
                return jsonify({'error': 'Translated subtitle file not found'}), 404

            return Response(
                local_download['content'],
                content_type='text/plain; charset=utf-8',
                headers={
                    'Content-Disposition': f'attachment; filename="{local_download["output_file_name"]}"'
                }
            )

        try:
            response = requests.get(f"{LLM_SUBTRANS_API_URL}/download/{job_id}/{file_name}", stream=True)
            if not response.ok:
                return build_proxy_response(response, 'Failed to download from LLM-Subtrans API')

            return Response(
                response.iter_content(chunk_size=8192),
                content_type=response.headers.get('Content-Type', 'text/plain'),
                headers={
                    'Content-Disposition': f'attachment; filename="{file_name}"'
                }
            )
        except requests.RequestException as error:
            print(f"LLM-Subtrans API download error: {error}")
            return jsonify({'error': 'Failed to download from LLM-Subtrans API'}), 502

    @app.route('/api/voiceover/start', methods=['POST'])
    def start_voiceover():
        claims, auth_error = require_access_token()
        if auth_error:
            return auth_error

        if 'file' not in request.files:
            return jsonify({'error': 'No file part'}), 400

        file = request.files['file']
        if not file.filename or not file.filename.lower().endswith('.srt'):
            return jsonify({'error': 'Only .srt files are supported'}), 400

        file_bytes = file.read()
        if not file_bytes:
            return jsonify({'error': 'Subtitle file is empty'}), 400

        files = {'file': (file.filename, io.BytesIO(file_bytes), file.mimetype or 'text/plain')}

        try:
            response = requests.post(
                build_vbee_router_url('/tasks'),
                files=files,
                timeout=30,
            )
            response_payload = read_response_payload(response)
            if response.ok:
                request_id = first_payload_value(response_payload, ('request_id', 'requestId', 'id'))
                request_error = save_server_request(
                    request_id,
                    get_claim_user_id(claims),
                    'voiceover',
                    'vbee-router',
                    source_file_name=file.filename,
                    details={'contentType': file.mimetype or 'text/plain'},
                )
                if request_error:
                    return request_error
            return build_proxy_response(response, 'Failed to communicate with Vbee Router')
        except requests.RequestException as error:
            print(f"Vbee Router error: {error}")
            return jsonify({'error': 'Failed to communicate with Vbee Router'}), 502

    @app.route('/api/voiceover/status/<string:request_id>', methods=['GET'])
    def get_voiceover_status(request_id):
        claims, auth_error = require_access_token()
        if auth_error:
            return auth_error

        stored_request, owner_error = require_request_owner(request_id, claims)
        if owner_error:
            return owner_error

        try:
            response = requests.get(
                build_vbee_router_url(f'/tasks/{request_id}'),
                timeout=15,
            )
            if response.ok:
                request_error = sync_server_request_status(stored_request, read_response_payload(response), 'voiceover')
                if request_error:
                    return request_error
            return build_proxy_response(response, 'Failed to communicate with Vbee Router')
        except requests.RequestException as error:
            print(f"Vbee Router error: {error}")
            return jsonify({'error': 'Failed to communicate with Vbee Router'}), 502

    @app.route('/api/voiceover/download', methods=['POST'])
    def download_voiceover():
        claims, auth_error = require_access_token()
        if auth_error:
            return auth_error

        payload = request.get_json(silent=True) or {}
        request_id = str(payload.get('request_id') or '').strip()
        download_url = str(payload.get('download_url') or '').strip()

        if not request_id:
            return jsonify({'error': 'No request_id specified'}), 400

        _stored_request, owner_error = require_request_owner(request_id, claims)
        if owner_error:
            return owner_error

        if not download_url:
            return jsonify({'error': 'No download_url specified'}), 400

        parsed_url = urlparse(download_url)
        if parsed_url.scheme not in {'http', 'https'} or not parsed_url.netloc:
            return jsonify({'error': 'Invalid download_url'}), 400

        try:
            response = requests.get(download_url, stream=True, timeout=120)
            if not response.ok:
                return build_proxy_response(response, 'Failed to download from Vbee service')

            file_name = parsed_url.path.rsplit('/', 1)[-1] or 'voiceover.mp3'
            content_disposition = response.headers.get('Content-Disposition')
            if content_disposition and 'filename=' in content_disposition:
                file_name = content_disposition.split('filename=', 1)[1].strip().strip('"')

            return Response(
                response.iter_content(chunk_size=8192),
                content_type=response.headers.get('Content-Type', 'audio/mpeg'),
                headers={
                    'Content-Disposition': f'attachment; filename="{file_name}"'
                }
            )
        except requests.RequestException as error:
            print(f"Vbee download error: {error}")
            return jsonify({'error': 'Failed to download from Vbee service'}), 502