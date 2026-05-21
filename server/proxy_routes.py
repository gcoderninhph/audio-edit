from flask import Response, jsonify, request
import io
import os
import requests

try:
    from auth_routes import require_access_token
    from proxy_credit_helpers import charge_user_credits_or_error, refund_credits_if_needed
    from proxy_route_helpers import (
        build_json_success_response,
        build_local_translation_response,
        build_proxy_response,
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

LLM_SUBTRANS_API_URL = os.environ.get('LLM_SUBTRANS_API_URL', 'http://llm-subtrans-web:8080/api').rstrip('/')
TRANSLATION_CREDIT_COST = 100


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

