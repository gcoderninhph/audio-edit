from flask import Response, jsonify, request

try:
    from controllers.auth_routes import require_access_token
    from services.openai_translation_service import (
        OpenAiTranslationValidationError,
        create_openai_translation_job,
        get_openai_translation_download,
        get_openai_translation_status,
        is_openai_translation_job,
    )
    from services.openai_translation_store import OpenAiTranslationError
    from utils.proxy_credit_helpers import charge_user_credits_or_error, refund_credits_if_needed
    from utils.proxy_route_helpers import get_claim_user_id, require_request_owner
    from controllers.proxy_transcription_routes import register_transcription_routes
    from services.translation_fallback import (
        get_local_translation_download,
        get_local_translation_status,
        is_local_translation_job,
        RequestStoreError,
    )
except ImportError:
    from .auth_routes import require_access_token
    from ..services.openai_translation_service import (
        OpenAiTranslationValidationError,
        create_openai_translation_job,
        get_openai_translation_download,
        get_openai_translation_status,
        is_openai_translation_job,
    )
    from ..services.openai_translation_store import OpenAiTranslationError
    from ..utils.proxy_credit_helpers import charge_user_credits_or_error, refund_credits_if_needed
    from utils.proxy_route_helpers import get_claim_user_id, require_request_owner
    from .proxy_transcription_routes import register_transcription_routes
    from ..services.translation_fallback import (
        get_local_translation_download,
        get_local_translation_status,
        is_local_translation_job,
        RequestStoreError,
    )

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
            response_payload = create_openai_translation_job(file_bytes, file.filename, target_language, user_id)
            return jsonify({
                **response_payload,
                'creditBalance': charged_user.get('credits'),
                'creditCost': TRANSLATION_CREDIT_COST,
            }), 202
        except OpenAiTranslationValidationError as error:
            refund_credits_if_needed(
                user_id,
                TRANSLATION_CREDIT_COST,
                'translation_refund',
                'Refunded translation credits',
                {'feature': 'translation'},
            )
            return jsonify({'error': str(error)}), 400
        except (OpenAiTranslationError, RequestStoreError) as error:
            refund_credits_if_needed(
                user_id,
                TRANSLATION_CREDIT_COST,
                'translation_refund',
                'Refunded translation credits',
                {'feature': 'translation'},
            )
            return jsonify({'error': str(error) or 'OpenAI translation service is unavailable'}), 503

    @app.route('/api/translation/status/<string:job_id>', methods=['GET'])
    def get_translation_status(job_id):
        claims, auth_error = require_access_token()
        if auth_error:
            return auth_error

        _stored_request, owner_error = require_request_owner(job_id, claims)
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

        if is_openai_translation_job(job_id):
            try:
                job_status = get_openai_translation_status(job_id)
            except RequestStoreError:
                return jsonify({'error': 'Translation request database is unavailable'}), 503
            if not job_status:
                return jsonify({'error': 'Translation job not found'}), 404
            return jsonify(job_status), 200

        return jsonify({'error': 'Translation job not found'}), 404

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

        if is_openai_translation_job(job_id):
            try:
                openai_download = get_openai_translation_download(job_id, file_name)
            except RequestStoreError:
                return jsonify({'error': 'Translation request database is unavailable'}), 503
            if not openai_download:
                return jsonify({'error': 'Translated subtitle file not found'}), 404

            return Response(
                openai_download['content'],
                content_type='text/plain; charset=utf-8',
                headers={
                    'Content-Disposition': f'attachment; filename="{openai_download["output_file_name"]}"'
                }
            )

        return jsonify({'error': 'Translated subtitle file not found'}), 404

