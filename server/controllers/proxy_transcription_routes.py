import time
from flask import jsonify, request

try:
    from controllers.auth_routes import require_access_token
    from services.subtitle_credit_service import calculate_transcription_credit
    from services.whisper_admin_store import WhisperAdminError
    from utils.proxy_credit_helpers import charge_user_credits_or_error, refund_credits_if_needed
    from services.whisper_runtime import (
        WhisperRuntimeError,
        build_transcription_status_payload,
        create_transcription_request,
        get_transcription_request_for_status,
    )
    from utils.proxy_route_helpers import build_json_success_response, get_claim_user_id, require_request_owner
except ImportError:
    from .auth_routes import require_access_token
    from ..services.subtitle_credit_service import calculate_transcription_credit
    from ..services.whisper_admin_store import WhisperAdminError
    from ..utils.proxy_credit_helpers import charge_user_credits_or_error, refund_credits_if_needed
    from ..services.whisper_runtime import (
        WhisperRuntimeError,
        build_transcription_status_payload,
        create_transcription_request,
        get_transcription_request_for_status,
    )
    from ..utils.proxy_route_helpers import build_json_success_response, get_claim_user_id, require_request_owner

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
        try:
            credit_estimate = calculate_transcription_credit(request.form.get('duration_seconds'))
        except WhisperAdminError:
            return jsonify({'error': 'Whisper credit config is unavailable'}), 503
        credit_cost = int(credit_estimate.get('creditCost') or 0)
        charged_user, charge_error = charge_user_credits_or_error(
            claims,
            credit_cost,
            'generate original subtitles',
            'transcription_charge',
            details={'feature': 'transcription', **credit_estimate},
        )
        if charge_error:
            return charge_error

        try:
            stored_request = create_transcription_request(file, user_id)
            payload = build_transcription_status_payload(stored_request or {})
            if payload.get('status') == -1:
                refund_credits_if_needed(
                    user_id,
                    credit_cost,
                    'transcription_refund',
                    'Refunded subtitle generation credits',
                    {'feature': 'transcription', **credit_estimate},
                )
                return jsonify({'error': payload.get('error') or 'Unable to start the Whisper job'}), 502
            response_status = 200 if payload.get('status') == 2 else 202
            return build_json_success_response(
                payload,
                response_status,
                creditBalance=charged_user.get('credits'),
                creditCost=credit_cost,
                creditEstimate=credit_estimate,
            )
        except WhisperRuntimeError as error:
            refund_credits_if_needed(
                user_id,
                credit_cost,
                'transcription_refund',
                'Refunded subtitle generation credits',
                {'feature': 'transcription', **credit_estimate},
            )
            return jsonify({'error': str(error)}), 503

    @app.route('/api/transcription/status/<string:job_id>', methods=['GET'])
    def get_transcription_status(job_id):
        claims, auth_error = require_access_token()
        if auth_error:
            return auth_error

        stored_request, owner_error = require_request_owner(job_id, claims)
        if owner_error:
            return owner_error

        try:
            refreshed_request = get_transcription_request_for_status(job_id) or stored_request
            return jsonify(build_transcription_status_payload(refreshed_request))
        except WhisperRuntimeError as error:
            return jsonify({'error': str(error)}), 503