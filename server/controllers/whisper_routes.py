from flask import jsonify, request

try:
    from controllers.auth_routes import require_admin_access
    from services.whisper_admin_store import (
        WhisperAdminError,
        WhisperAdminNotFoundError,
        WhisperAdminValidationError,
        create_whisper_processing_node,
        delete_whisper_processing_node,
        get_whisper_service_config,
        list_whisper_processing_nodes,
        list_whisper_requests_page,
        update_whisper_service_config,
        update_whisper_processing_node,
    )
except ImportError:
    from .auth_routes import require_admin_access
    from ..services.whisper_admin_store import (
        WhisperAdminError,
        WhisperAdminNotFoundError,
        WhisperAdminValidationError,
        create_whisper_processing_node,
        delete_whisper_processing_node,
        get_whisper_service_config,
        list_whisper_processing_nodes,
        list_whisper_requests_page,
        update_whisper_service_config,
        update_whisper_processing_node,
    )


def _store_error_response():
    return jsonify({'error': 'Whisper admin storage is unavailable'}), 503


def register_whisper_routes(app):
    @app.route('/api/admin/services/whisper/requests', methods=['GET'])
    def admin_whisper_requests_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            page = list_whisper_requests_page(
                status=request.args.get('status') or '',
                page=request.args.get('page'),
                page_size=request.args.get('pageSize'),
            )
            return jsonify(page)
        except WhisperAdminError:
            return _store_error_response()

    @app.route('/api/admin/services/whisper/config', methods=['GET', 'PATCH'])
    def admin_whisper_config_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            if request.method == 'GET':
                return jsonify({'config': get_whisper_service_config()})
            return jsonify({'config': update_whisper_service_config(request.get_json(silent=True) or {})})
        except WhisperAdminValidationError as error:
            return jsonify({'error': str(error)}), 400
        except WhisperAdminError:
            return _store_error_response()

    @app.route('/api/admin/services/whisper/nodes', methods=['GET', 'POST'])
    def admin_whisper_nodes_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            if request.method == 'GET':
                return jsonify({'nodes': list_whisper_processing_nodes()})
            return jsonify({'node': create_whisper_processing_node(request.get_json(silent=True) or {})}), 201
        except WhisperAdminValidationError as error:
            return jsonify({'error': str(error)}), 400
        except WhisperAdminError:
            return _store_error_response()

    @app.route('/api/admin/services/whisper/nodes/<int:node_id>', methods=['PATCH', 'DELETE'])
    def admin_whisper_node_detail_route(node_id):
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error
        try:
            if request.method == 'DELETE':
                return jsonify(delete_whisper_processing_node(node_id))
            return jsonify({'node': update_whisper_processing_node(node_id, request.get_json(silent=True) or {})})
        except WhisperAdminNotFoundError as error:
            return jsonify({'error': str(error)}), 404
        except WhisperAdminValidationError as error:
            return jsonify({'error': str(error)}), 400
        except WhisperAdminError:
            return _store_error_response()