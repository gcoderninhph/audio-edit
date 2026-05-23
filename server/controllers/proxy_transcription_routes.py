import time
import os
import requests
from flask import jsonify, request

try:
    from controllers.auth_routes import require_access_token
    from utils.proxy_credit_helpers import charge_user_credits_or_error, refund_credits_if_needed
    from utils.proxy_route_helpers import (
        build_json_success_response,
        build_proxy_response,
        first_payload_value,
        get_claim_user_id,
        read_response_payload,
        require_request_owner,
        save_server_request,
        sync_server_request_status,
    )
except ImportError:
    from .auth_routes import require_access_token
    from ..utils.proxy_credit_helpers import charge_user_credits_or_error, refund_credits_if_needed
    from ..utils.proxy_route_helpers import (
        build_json_success_response,
        build_proxy_response,
        first_payload_value,
        get_claim_user_id,
        read_response_payload,
        require_request_owner,
        save_server_request,
        sync_server_request_status,
    )

def normalize_whisper_base_url(raw_url):
    base_url = str(raw_url or 'http://whishper:8000').strip().rstrip('/')
    for suffix in ('/api/transcriptions', '/api/transcribe', '/transcribe'):
        if base_url.endswith(suffix):
            return base_url[:-len(suffix)]
    return base_url


WHISPER_BASE_URL = normalize_whisper_base_url(os.environ.get('WHISPER_API_URL', 'http://whishper:8000'))
WHISPER_TRANSCRIBE_URL = f'{WHISPER_BASE_URL}/transcribe/'
TRANSCRIPTION_CREDIT_COST = 20


def register_transcription_routes(app):
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
            'model_size': 'base',
            'language': 'auto',
            'device': 'cpu',
        }
        user_id = get_claim_user_id(claims)
        charged_user, charge_error = charge_user_credits_or_error(
            claims,
            TRANSCRIPTION_CREDIT_COST,
            'generate original subtitles',
            'transcription_charge',
            details={'feature': 'transcription'},
        )
        if charge_error:
            return charge_error

        try:
            response = requests.post(WHISPER_TRANSCRIBE_URL, files=files, data=data)
            response_payload = read_response_payload(response)
            if response.ok:
                request_id = first_payload_value(response_payload, ('id', 'jobId', 'requestId', 'request_id'))
                if not request_id and isinstance(response_payload, dict) and 'segments' in response_payload:
                    request_error = save_server_request(
                        f'whishper-sync-{int(time.time() * 1000)}',
                        user_id,
                        'transcription',
                        'whishper',
                        status='success',
                        source_file_name=file.filename,
                        details={
                            'modelSize': data['model_size'],
                            'language': data['language'],
                            'device': data['device'],
                            'mode': 'sync',
                            'segmentCount': len(response_payload.get('segments') or []),
                        },
                    )
                    if request_error:
                        return request_error
                    return build_json_success_response(
                        response_payload,
                        response.status_code,
                        creditBalance=charged_user.get('credits'),
                        creditCost=TRANSCRIPTION_CREDIT_COST,
                    )
                if not request_id:
                    refund_credits_if_needed(
                        user_id,
                        TRANSCRIPTION_CREDIT_COST,
                        'transcription_refund',
                        'Refunded subtitle generation credits',
                        {'feature': 'transcription'},
                    )
                    return jsonify({'error': 'Whisper did not return a job ID'}), 502
                request_error = save_server_request(
                    request_id,
                    user_id,
                    'transcription',
                    'whisper',
                    source_file_name=file.filename,
                    details={'modelSize': data['model_size'], 'language': data['language'], 'device': data['device']},
                )
                if request_error:
                    return request_error
                return build_json_success_response(
                    response_payload,
                    response.status_code,
                    creditBalance=charged_user.get('credits'),
                    creditCost=TRANSCRIPTION_CREDIT_COST,
                )

            refund_credits_if_needed(
                user_id,
                TRANSCRIPTION_CREDIT_COST,
                'transcription_refund',
                'Refunded subtitle generation credits',
                {'feature': 'transcription'},
            )
            return build_proxy_response(response, 'Failed to communicate with Whisper API')
        except requests.RequestException as error:
            refund_credits_if_needed(
                user_id,
                TRANSCRIPTION_CREDIT_COST,
                'transcription_refund',
                'Refunded subtitle generation credits',
                {'feature': 'transcription'},
            )
            print(f'Whisper API error: {error}')
            return jsonify({'error': 'Failed to communicate with Whisper API'}), 502

    @app.route('/api/transcription/status/<string:job_id>', methods=['GET'])
    def get_transcription_status(job_id):
        claims, auth_error = require_access_token()
        if auth_error:
            return auth_error

        stored_request, owner_error = require_request_owner(job_id, claims)
        if owner_error:
            return owner_error

        if (stored_request.get('details') or {}).get('mode') == 'sync':
            return jsonify({'error': 'This transcription completed immediately and cannot be polled'}), 404

        try:
            response = requests.get(f'{WHISPER_BASE_URL}/api/transcriptions/{job_id}')
            if response.ok:
                request_error = sync_server_request_status(stored_request, read_response_payload(response), 'transcription')
                if request_error:
                    return request_error
            return build_proxy_response(response, 'Failed to communicate with Whisper API')
        except requests.RequestException as error:
            print(f'Whisper API error: {error}')
            return jsonify({'error': 'Failed to communicate with Whisper API'}), 502