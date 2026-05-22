import hmac

import requests
from flask import Response, jsonify, request, stream_with_context

try:
    from admin_store import get_auth_user
    from vbee_asset_service import clear_all_vbee_segment_assets, delete_vbee_segment_asset, expire_vbee_segment_assets, get_vbee_segment_asset_download_url
    from auth_routes import AuthStoreError, require_access_token, require_admin_access, verify_password
    from proxy_credit_helpers import charge_user_credits_or_error, refund_credits_if_needed
    from vbee_service import apply_vbee_webhook, create_voiceover_request, get_voiceover_request_status, normalize_srt_subtitles, normalize_subtitles, refresh_processing_vbee_segments
    from vbee_voice_catalog import list_vbee_supported_languages
    from vbee_store import (
        VbeeNotFoundError,
        VbeeValidationError,
        create_vbee_token,
        delete_vbee_token,
        get_vbee_config,
        get_vbee_request,
        get_vbee_segment_detail,
        get_vbee_token,
        list_vbee_segment_summaries_page,
        list_vbee_requests_page,
        list_vbee_tokens,
        update_vbee_config,
        update_vbee_token,
    )
except ImportError:
    from .admin_store import get_auth_user
    from .vbee_asset_service import clear_all_vbee_segment_assets, delete_vbee_segment_asset, expire_vbee_segment_assets, get_vbee_segment_asset_download_url
    from .auth_routes import AuthStoreError, require_access_token, require_admin_access, verify_password
    from .proxy_credit_helpers import charge_user_credits_or_error, refund_credits_if_needed
    from .vbee_service import apply_vbee_webhook, create_voiceover_request, get_voiceover_request_status, normalize_srt_subtitles, normalize_subtitles, refresh_processing_vbee_segments
    from .vbee_voice_catalog import list_vbee_supported_languages
    from .vbee_store import (
        VbeeNotFoundError,
        VbeeValidationError,
        create_vbee_token,
        delete_vbee_token,
        get_vbee_config,
        get_vbee_request,
        get_vbee_segment_detail,
        get_vbee_token,
        list_vbee_segment_summaries_page,
        list_vbee_requests_page,
        list_vbee_tokens,
        update_vbee_config,
        update_vbee_token,
    )


VOICEOVER_CREDIT_COST = 200


def _store_error_response():
    return jsonify({'error': 'Vbee storage is unavailable'}), 503


def _request_base_url():
    return request.host_url or ''


def _normalize_host(value):
    host = str(value or '').strip().rstrip('/')
    if host and '://' not in host:
        host = f'https://{host}'
    return host


def _config_payload():
    config = get_vbee_config()
    webhook_host = _normalize_host(config.get('webhookHost')) or _normalize_host(_request_base_url())
    webhook_path = '/api/vbee/webhook'
    return {
        **config,
        'supportedLanguages': list_vbee_supported_languages(),
        'webhookHost': webhook_host,
        'webhookPath': webhook_path,
        'webhookUrl': f'{webhook_host}{webhook_path}' if webhook_host else webhook_path,
    }


def _public_config_payload():
    config = get_vbee_config()
    return {
        'audioType': config.get('audioType') or 'wav',
        'defaultLanguage': config.get('defaultLanguage') or 'vi',
        'enabledLanguageCodes': config.get('enabledLanguageCodes') or [],
        'supportedLanguages': list_vbee_supported_languages(),
    }


def _load_segment_audio_url(segment):
    return get_vbee_segment_asset_download_url(segment.get('hash') or segment.get('cacheKey') or '')


def _stream_audio_response(audio_url):
    request_headers = {}
    range_header = request.headers.get('Range')
    if range_header:
        request_headers['Range'] = range_header
    upstream_response = requests.get(audio_url, headers=request_headers, stream=True, timeout=60)
    upstream_response.raise_for_status()
    response_headers = {
        'Cache-Control': 'no-store',
        'Content-Disposition': 'inline',
        'Content-Type': upstream_response.headers.get('Content-Type') or 'audio/mpeg',
    }
    for header_name in ('Accept-Ranges', 'Content-Length', 'Content-Range'):
        header_value = upstream_response.headers.get(header_name)
        if header_value:
            response_headers[header_name] = header_value

    def generate():
        try:
            for chunk in upstream_response.iter_content(chunk_size=64 * 1024):
                if chunk:
                    yield chunk
        finally:
            upstream_response.close()

    return Response(stream_with_context(generate()), status=upstream_response.status_code, headers=response_headers)


def _refresh_admin_vbee_segments(limit=200):
    expire_vbee_segment_assets(limit=max(20, int(limit or 200)))
    refresh_processing_vbee_segments(limit=limit)


def _require_verified_admin_password(claims, payload):
    password = str((payload or {}).get('password') or '')
    if not password:
        return None, (jsonify({'error': 'Admin password is required.'}), 400)
    admin_user = get_auth_user(claims.get('sub'))
    if not verify_password(password, admin_user):
        return None, (jsonify({'error': 'Admin password is incorrect.'}), 401)
    return admin_user, None


def _read_start_payload():
    if request.is_json:
        payload = request.get_json(silent=True) or {}
        return payload, normalize_subtitles(payload.get('subtitles') or [])
    form = request.form or {}
    subtitle_file = request.files.get('subtitle_file') or request.files.get('file')
    if not subtitle_file:
        raise VbeeValidationError('subtitle_file is required.')
    subtitles = normalize_srt_subtitles(subtitle_file.read().decode('utf-8', errors='replace'))
    return {
        'language': form.get('languageCode') or form.get('language') or form.get('target_language'),
        'voiceCode': form.get('voiceCode') or form.get('voice_code'),
    }, subtitles


def _webhook_authorized(payload):
    expected_secret = str((get_vbee_config() or {}).get('webhookSecret') or '').strip()
    if not expected_secret:
        return True
    candidates = [
        request.headers.get('X-Vbee-Webhook-Secret'),
        request.headers.get('X-Webhook-Secret'),
        request.args.get('secret'),
        payload.get('secret') if isinstance(payload, dict) else '',
    ]
    return any(hmac.compare_digest(expected_secret, str(candidate or '')) for candidate in candidates)


def register_vbee_routes(app):
    @app.route('/api/voiceover/config', methods=['GET'])
    def get_voiceover_config_route():
        try:
            return jsonify({'config': _public_config_payload()})
        except AuthStoreError:
            return _store_error_response()

    @app.route('/api/voiceover/start', methods=['POST'])
    def start_voiceover_route():
        claims, auth_error = require_access_token()
        if auth_error:
            return auth_error
        try:
            payload, subtitles = _read_start_payload()
            charged_user, charge_error = charge_user_credits_or_error(
                claims,
                VOICEOVER_CREDIT_COST,
                'generate voiceover',
                'voiceover_charge',
                details={'provider': 'vbee', 'subtitleCount': len(subtitles)},
            )
            if charge_error:
                return charge_error
            request_record = create_voiceover_request(
                claims.get('sub'),
                subtitles,
                language=payload.get('languageCode') or payload.get('language'),
                voice_code=payload.get('voiceCode') or payload.get('voice_code'),
                webhook_base_url=_request_base_url(),
            )
            return jsonify({
                **request_record,
                'request_id': request_record['requestId'],
                'creditBalance': charged_user.get('credits'),
                'creditCost': VOICEOVER_CREDIT_COST,
            }), 202
        except VbeeValidationError as error:
            return jsonify({'error': str(error)}), 400
        except AuthStoreError:
            refund_credits_if_needed(claims.get('sub'), VOICEOVER_CREDIT_COST, 'voiceover_refund', 'Refunded voiceover credits', {'provider': 'vbee'})
            return _store_error_response()

    @app.route('/api/voiceover/status/<string:request_id>', methods=['GET'])
    def get_voiceover_status_route(request_id):
        claims, auth_error = require_access_token()
        if auth_error:
            return auth_error
        try:
            request_record = get_voiceover_request_status(request_id, user_id=claims.get('sub'))
            return jsonify({**request_record, 'request_id': request_record['requestId']})
        except VbeeNotFoundError:
            return jsonify({'error': 'Voiceover request not found'}), 404
        except AuthStoreError:
            return _store_error_response()

    @app.route('/api/vbee/webhook', methods=['POST'])
    def vbee_webhook_route():
        payload = request.get_json(silent=True) or {}
        if not _webhook_authorized(payload):
            return jsonify({'error': 'Invalid webhook secret'}), 401
        try:
            request_record = apply_vbee_webhook(payload)
            return jsonify({'request': request_record})
        except VbeeValidationError as error:
            return jsonify({'error': str(error)}), 400
        except VbeeNotFoundError:
            return jsonify({'error': 'Vbee segment not found'}), 404
        except AuthStoreError:
            return _store_error_response()

    @app.route('/api/admin/services/vbee/tokens', methods=['GET', 'POST'])
    def admin_vbee_tokens_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            if request.method == 'GET':
                return jsonify({'tokens': list_vbee_tokens()})
            token = create_vbee_token(request.get_json(silent=True) or {})
            return jsonify({'token': token}), 201
        except VbeeValidationError as error:
            return jsonify({'error': str(error)}), 400
        except AuthStoreError:
            return _store_error_response()

    @app.route('/api/admin/services/vbee/tokens/<int:token_id>', methods=['GET', 'PATCH', 'DELETE'])
    def admin_vbee_token_route(token_id):
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            if request.method == 'GET':
                return jsonify({'token': get_vbee_token(token_id)})
            if request.method == 'DELETE':
                return jsonify({'token': delete_vbee_token(token_id)})
            return jsonify({'token': update_vbee_token(token_id, request.get_json(silent=True) or {})})
        except VbeeNotFoundError:
            return jsonify({'error': 'Vbee token not found'}), 404
        except VbeeValidationError as error:
            return jsonify({'error': str(error)}), 400
        except AuthStoreError:
            return _store_error_response()

    @app.route('/api/admin/services/vbee/requests', methods=['GET'])
    def admin_vbee_requests_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            page = list_vbee_requests_page(status=request.args.get('status') or '', page=request.args.get('page'), page_size=request.args.get('pageSize'))
            return jsonify({'requests': page['requests'], 'pagination': page['pagination']})
        except AuthStoreError:
            return _store_error_response()

    @app.route('/api/admin/services/vbee/requests/<string:request_id>', methods=['GET'])
    def admin_vbee_request_route(request_id):
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            return jsonify({'request': get_vbee_request(request_id)})
        except VbeeNotFoundError:
            return jsonify({'error': 'Vbee request not found'}), 404
        except AuthStoreError:
            return _store_error_response()

    @app.route('/api/admin/services/vbee/segments', methods=['GET'])
    def admin_vbee_segments_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            _refresh_admin_vbee_segments()
            page = list_vbee_segment_summaries_page(
                status=request.args.get('status') or '',
                page=request.args.get('page'),
                page_size=request.args.get('pageSize'),
            )
            return jsonify({'segments': page['segments'], 'pagination': page['pagination']})
        except AuthStoreError:
            return _store_error_response()

    @app.route('/api/admin/services/vbee/segments/clear-cache', methods=['POST'])
    def admin_vbee_segments_clear_cache_route():
        claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            payload = request.get_json(silent=True) or {}
            _admin_user, password_error = _require_verified_admin_password(claims, payload)
            if password_error:
                return password_error
            return jsonify({'result': clear_all_vbee_segment_assets()})
        except RuntimeError as error:
            return jsonify({'error': str(error)}), 503
        except AuthStoreError:
            return _store_error_response()

    @app.route('/api/admin/services/vbee/segments/<string:cache_key>', methods=['GET', 'DELETE'])
    def admin_vbee_segment_route(cache_key):
        claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            if request.method == 'DELETE':
                payload = request.get_json(silent=True) or {}
                _admin_user, password_error = _require_verified_admin_password(claims, payload)
                if password_error:
                    return password_error
                return jsonify({'result': delete_vbee_segment_asset(cache_key)})
            _refresh_admin_vbee_segments()
            return jsonify({'segment': get_vbee_segment_detail(cache_key)})
        except VbeeNotFoundError:
            return jsonify({'error': 'Vbee segment not found'}), 404
        except RuntimeError as error:
            return jsonify({'error': str(error)}), 503
        except AuthStoreError:
            return _store_error_response()

    @app.route('/api/admin/services/vbee/segments/<string:cache_key>/audio-url', methods=['GET'])
    def admin_vbee_segment_audio_url_route(cache_key):
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            _refresh_admin_vbee_segments()
            segment = get_vbee_segment_detail(cache_key)
            if segment.get('status') != 'complete':
                return jsonify({'error': 'Segment audio is not ready yet.'}), 409
            audio_url = _load_segment_audio_url(segment)
            if not audio_url:
                return jsonify({'error': 'Segment audio is unavailable.'}), 404
            return jsonify({'audioUrl': audio_url})
        except VbeeNotFoundError:
            return jsonify({'error': 'Vbee segment not found'}), 404
        except AuthStoreError:
            return _store_error_response()

    @app.route('/api/admin/services/vbee/segments/<string:cache_key>/audio-stream', methods=['GET'])
    def admin_vbee_segment_audio_stream_route(cache_key):
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            _refresh_admin_vbee_segments()
            segment = get_vbee_segment_detail(cache_key)
            if segment.get('status') != 'complete':
                return jsonify({'error': 'Segment audio is not ready yet.'}), 409
            audio_url = _load_segment_audio_url(segment)
            if not audio_url:
                return jsonify({'error': 'Segment audio is unavailable.'}), 404
            return _stream_audio_response(audio_url)
        except VbeeNotFoundError:
            return jsonify({'error': 'Vbee segment not found'}), 404
        except requests.RequestException:
            return jsonify({'error': 'Unable to stream Vbee segment audio.'}), 502
        except AuthStoreError:
            return _store_error_response()

    @app.route('/api/admin/services/vbee/config', methods=['GET', 'PATCH'])
    def admin_vbee_config_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            if request.method == 'GET':
                return jsonify({'config': _config_payload()})
            update_vbee_config(request.get_json(silent=True) or {})
            return jsonify({'config': _config_payload()})
        except AuthStoreError:
            return _store_error_response()