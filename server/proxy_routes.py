from flask import Response, jsonify, request
import io
import requests
from urllib.parse import urlparse

try:
    from auth_routes import require_access_token
    from proxy_credit_helpers import charge_user_credits_or_error, refund_credits_if_needed
    from proxy_route_helpers import (
        build_json_success_response,
        build_local_translation_response,
        build_proxy_response,
        build_vbee_router_url,
        first_payload_value,
        get_claim_user_id,
        read_response_payload,
        require_request_owner,
        save_server_request,
        should_use_local_translation_fallback,
        sync_server_request_status,
    )
    from proxy_transcription_routes import register_transcription_routes
    from translation_fallback import (
        get_local_translation_download,
        get_local_translation_status,
        is_local_translation_job,
        RequestStoreError,
    )
except ImportError:
    from .auth_routes import require_access_token
    from .proxy_credit_helpers import charge_user_credits_or_error, refund_credits_if_needed
    from .proxy_route_helpers import (
        build_json_success_response,
        build_local_translation_response,
        build_proxy_response,
        build_vbee_router_url,
        first_payload_value,
        get_claim_user_id,
        read_response_payload,
        require_request_owner,
        save_server_request,
        should_use_local_translation_fallback,
        sync_server_request_status,
    )
    from .proxy_transcription_routes import register_transcription_routes
    from .translation_fallback import (
        get_local_translation_download,
        get_local_translation_status,
        is_local_translation_job,
        RequestStoreError,
    )

LLM_SUBTRANS_API_URL = "http://localhost:8090/api"
TRANSLATION_CREDIT_COST = 100
VOICEOVER_CREDIT_COST = 200


def register_proxy_routes(app):
    register_transcription_routes(app)

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
        user_id = get_claim_user_id(claims)
        charged_user, charge_error = charge_user_credits_or_error(
            claims,
            TRANSLATION_CREDIT_COST,
            'translate subtitles',
            'translation_charge',
            details={'feature': 'translation'},
        )
        if charge_error:
            return charge_error

        try:
            response = requests.post(f"{LLM_SUBTRANS_API_URL}/translate", files=files, data=data)
            if should_use_local_translation_fallback(response=response):
                local_response = build_local_translation_response(
                    file_bytes,
                    file.filename,
                    target_language,
                    user_id,
                    creditBalance=charged_user.get('credits'),
                    creditCost=TRANSLATION_CREDIT_COST,
                )
                if local_response[1] >= 400:
                    refund_credits_if_needed(
                        user_id,
                        TRANSLATION_CREDIT_COST,
                        'translation_refund',
                        'Refunded translation credits',
                        {'feature': 'translation'},
                    )
                return local_response

            response_payload = read_response_payload(response)
            if response.ok:
                request_id = first_payload_value(response_payload, ('requestId', 'request_id', 'id', 'jobId'))
                output_file_name = first_payload_value(response_payload, ('outputFileName', 'output_file_name', 'fileName'))
                if not request_id:
                    refund_credits_if_needed(
                        user_id,
                        TRANSLATION_CREDIT_COST,
                        'translation_refund',
                        'Refunded translation credits',
                        {'feature': 'translation'},
                    )
                    return jsonify({'error': 'Translation service did not return a request ID'}), 502
                request_error = save_server_request(
                    request_id,
                    user_id,
                    'translation',
                    'llm-subtrans',
                    source_file_name=file.filename,
                    target_language=target_language,
                    output_file_name=output_file_name,
                    details={'localFallback': False},
                )
                if request_error:
                    return request_error
                return build_json_success_response(
                    response_payload,
                    response.status_code,
                    creditBalance=charged_user.get('credits'),
                    creditCost=TRANSLATION_CREDIT_COST,
                )

            refund_credits_if_needed(
                user_id,
                TRANSLATION_CREDIT_COST,
                'translation_refund',
                'Refunded translation credits',
                {'feature': 'translation'},
            )
            return build_proxy_response(response, 'Failed to communicate with LLM-Subtrans API')
        except requests.RequestException as error:
            print(f"LLM-Subtrans API error: {error}")
            local_response = build_local_translation_response(
                file_bytes,
                file.filename,
                target_language,
                user_id,
                creditBalance=charged_user.get('credits'),
                creditCost=TRANSLATION_CREDIT_COST,
            )
            if local_response[1] >= 400:
                refund_credits_if_needed(
                    user_id,
                    TRANSLATION_CREDIT_COST,
                    'translation_refund',
                    'Refunded translation credits',
                    {'feature': 'translation'},
                )
            return local_response

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
        user_id = get_claim_user_id(claims)
        charged_user, charge_error = charge_user_credits_or_error(
            claims,
            VOICEOVER_CREDIT_COST,
            'generate voiceover',
            'voiceover_charge',
            details={'feature': 'voiceover'},
        )
        if charge_error:
            return charge_error

        try:
            response = requests.post(
                build_vbee_router_url('/tasks'),
                files=files,
                timeout=30,
            )
            response_payload = read_response_payload(response)
            if response.ok:
                request_id = first_payload_value(response_payload, ('request_id', 'requestId', 'id'))
                if not request_id:
                    refund_credits_if_needed(
                        user_id,
                        VOICEOVER_CREDIT_COST,
                        'voiceover_refund',
                        'Refunded voiceover credits',
                        {'feature': 'voiceover'},
                    )
                    return jsonify({'error': 'Vbee router did not return a request_id'}), 502
                request_error = save_server_request(
                    request_id,
                    user_id,
                    'voiceover',
                    'vbee-router',
                    source_file_name=file.filename,
                    details={'contentType': file.mimetype or 'text/plain'},
                )
                if request_error:
                    return request_error
                return build_json_success_response(
                    response_payload,
                    response.status_code,
                    creditBalance=charged_user.get('credits'),
                    creditCost=VOICEOVER_CREDIT_COST,
                )

            refund_credits_if_needed(
                user_id,
                VOICEOVER_CREDIT_COST,
                'voiceover_refund',
                'Refunded voiceover credits',
                {'feature': 'voiceover'},
            )
            return build_proxy_response(response, 'Failed to communicate with Vbee Router')
        except requests.RequestException as error:
            refund_credits_if_needed(
                user_id,
                VOICEOVER_CREDIT_COST,
                'voiceover_refund',
                'Refunded voiceover credits',
                {'feature': 'voiceover'},
            )
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