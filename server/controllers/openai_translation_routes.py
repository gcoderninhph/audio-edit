from flask import jsonify, request

try:
    from controllers.auth_routes import AuthStoreError, require_admin_access
    from services.openai_translation_service import RequestStoreError, run_openai_translation_test
    from services.openai_translation_store import (
        OpenAiTranslationError,
        OpenAiTranslationNotFoundError,
        OpenAiTranslationValidationError,
        create_openai_translation_token,
        delete_openai_translation_token,
        get_openai_request_record,
        get_openai_translation_config,
        get_openai_translation_token,
        list_openai_request_records_page,
        list_openai_translation_tokens,
        update_openai_translation_config,
        update_openai_translation_token,
    )
except ImportError:
    from .auth_routes import AuthStoreError, require_admin_access
    from ..services.openai_translation_service import RequestStoreError, run_openai_translation_test
    from ..services.openai_translation_store import (
        OpenAiTranslationError,
        OpenAiTranslationNotFoundError,
        OpenAiTranslationValidationError,
        create_openai_translation_token,
        delete_openai_translation_token,
        get_openai_request_record,
        get_openai_translation_config,
        get_openai_translation_token,
        list_openai_request_records_page,
        list_openai_translation_tokens,
        update_openai_translation_config,
        update_openai_translation_token,
    )


def _store_error_response():
    return jsonify({'error': 'OpenAI translation storage is unavailable'}), 503


def _serialize_request(record):
    return {
        'requestId': record.get('request_id') or '',
        'userId': record.get('user_id') or '',
        'requestType': record.get('request_type') or '',
        'provider': record.get('provider') or '',
        'status': record.get('status') or '',
        'sourceFileName': record.get('source_file_name') or '',
        'targetLanguage': record.get('target_language') or '',
        'outputFileName': record.get('output_file_name') or '',
        'details': record.get('details') or {},
        'createdAt': float(record.get('created_at') or 0),
        'updatedAt': float(record.get('updated_at') or 0),
    }


def register_openai_translation_routes(app):
    @app.route('/api/admin/services/openai/tokens', methods=['GET', 'POST'])
    def admin_openai_tokens_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            if request.method == 'GET':
                return jsonify({'tokens': list_openai_translation_tokens()})
            return jsonify({'token': create_openai_translation_token(request.get_json(silent=True) or {})}), 201
        except OpenAiTranslationValidationError as error:
            return jsonify({'error': str(error)}), 400
        except (AuthStoreError, OpenAiTranslationError):
            return _store_error_response()

    @app.route('/api/admin/services/openai/tokens/<int:token_id>', methods=['GET', 'PATCH', 'DELETE'])
    def admin_openai_token_route(token_id):
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            if request.method == 'GET':
                return jsonify({'token': get_openai_translation_token(token_id)})
            if request.method == 'DELETE':
                return jsonify({'token': delete_openai_translation_token(token_id)})
            return jsonify({'token': update_openai_translation_token(token_id, request.get_json(silent=True) or {})})
        except OpenAiTranslationNotFoundError:
            return jsonify({'error': 'OpenAI token not found'}), 404
        except OpenAiTranslationValidationError as error:
            return jsonify({'error': str(error)}), 400
        except (AuthStoreError, OpenAiTranslationError):
            return _store_error_response()

    @app.route('/api/admin/services/openai/requests', methods=['GET'])
    def admin_openai_requests_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            page = list_openai_request_records_page(
                status=request.args.get('status') or '',
                page=request.args.get('page'),
                page_size=request.args.get('pageSize'),
            )
            return jsonify({
                'requests': [_serialize_request(record) for record in page['requests']],
                'pagination': page['pagination'],
            })
        except (AuthStoreError, OpenAiTranslationError):
            return _store_error_response()

    @app.route('/api/admin/services/openai/requests/<string:request_id>', methods=['GET'])
    def admin_openai_request_route(request_id):
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            return jsonify({'request': _serialize_request(get_openai_request_record(request_id))})
        except OpenAiTranslationNotFoundError:
            return jsonify({'error': 'OpenAI request not found'}), 404
        except (AuthStoreError, OpenAiTranslationError):
            return _store_error_response()

    @app.route('/api/admin/services/openai/config', methods=['GET', 'PATCH'])
    def admin_openai_config_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            if request.method == 'GET':
                return jsonify({'config': get_openai_translation_config()})
            return jsonify({'config': update_openai_translation_config(request.get_json(silent=True) or {})})
        except OpenAiTranslationValidationError as error:
            return jsonify({'error': str(error)}), 400
        except (AuthStoreError, OpenAiTranslationError):
            return _store_error_response()

    @app.route('/api/admin/services/openai/test-translate', methods=['POST'])
    def admin_openai_test_translate_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            upload = request.files.get('file')
            if upload is None:
                raise OpenAiTranslationValidationError('Please upload an .srt subtitle file.')
            target_language = request.form.get('targetLanguage') or ''
            result = run_openai_translation_test(
                upload.read(),
                upload.filename or 'subtitles.srt',
                target_language,
                user_id=str((_claims or {}).get('sub') or ''),
            )
            return jsonify({'result': result})
        except OpenAiTranslationValidationError as error:
            return jsonify({'error': str(error)}), 400
        except (AuthStoreError, OpenAiTranslationError, RequestStoreError):
            return _store_error_response()
        except Exception as error:
            return jsonify({'error': str(error) or 'OpenAI test translation failed.'}), 502