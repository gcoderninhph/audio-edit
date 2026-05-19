from flask import jsonify, request

try:
    from admin_bootstrap import clear_temporary_admin_state, is_temporary_admin_claims
    from admin_store import AdminAccountLockError, LastAdminRemovalError, UserNotFoundError, get_auth_user, get_auth_user_summary, has_admin_account, list_auth_users_page, update_auth_user_admin_fields
    from auth_credit_store import add_user_credits, list_user_credit_history_page
    from auth_routes import (
        ADMIN_USER_ROLE,
        AuthStoreError,
        DEFAULT_INITIAL_CREDITS,
        DuplicateUserError,
        MIN_PASSWORD_LENGTH,
        build_token_pair,
        create_registered_user,
        find_registered_user,
        hash_password,
        normalize_display_name,
        normalize_username,
        public_user_from_record,
        require_admin_access,
    )
    from request_store import RequestStoreError, list_recent_request_records, list_user_request_records_page
except ImportError:
    from .admin_bootstrap import clear_temporary_admin_state, is_temporary_admin_claims
    from .admin_store import AdminAccountLockError, LastAdminRemovalError, UserNotFoundError, get_auth_user, get_auth_user_summary, has_admin_account, list_auth_users_page, update_auth_user_admin_fields
    from .auth_credit_store import add_user_credits, list_user_credit_history_page
    from .auth_routes import (
        ADMIN_USER_ROLE,
        AuthStoreError,
        DEFAULT_INITIAL_CREDITS,
        DuplicateUserError,
        MIN_PASSWORD_LENGTH,
        build_token_pair,
        create_registered_user,
        find_registered_user,
        hash_password,
        normalize_display_name,
        normalize_username,
        public_user_from_record,
        require_admin_access,
    )
    from .request_store import RequestStoreError, list_recent_request_records, list_user_request_records_page


MAX_ADMIN_REQUEST_LIMIT = 200
MAX_ADMIN_PAGE_SIZE = 100


def _to_int(value, default_value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return int(default_value)


def _serialize_admin_user(user_record):
    public_user = public_user_from_record(user_record)
    return {
        **public_user,
        'createdAt': int(user_record.get('createdAt') or 0),
        'updatedAt': int(user_record.get('updatedAt') or 0),
    }


def _serialize_request_record(record):
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


def _serialize_credit_event(record):
    return {
        'id': int(record.get('id') or 0),
        'userId': record.get('userId') or '',
        'actorUserId': record.get('actorUserId') or '',
        'changeType': record.get('changeType') or 'adjustment',
        'deltaCredits': int(record.get('deltaCredits') or 0),
        'balanceAfter': int(record.get('balanceAfter') or 0),
        'note': record.get('note') or '',
        'details': record.get('details') or {},
        'createdAt': int(record.get('createdAt') or 0),
    }


def _safe_request_limit(raw_limit, default=50):
    return max(1, min(MAX_ADMIN_REQUEST_LIMIT, _to_int(raw_limit, default)))


def _safe_page(raw_page, default=1):
    return max(1, _to_int(raw_page, default))


def _safe_page_size(raw_page_size, default=10, maximum=MAX_ADMIN_PAGE_SIZE):
    return max(1, min(maximum, _to_int(raw_page_size, default)))


def _auth_store_error_response():
    return jsonify({'error': 'Authentication database is unavailable'}), 503


def _request_store_error_response():
    return jsonify({'error': 'Request database is unavailable'}), 503


def _build_admin_email(username):
    return f'{username}@admin.local'


def register_admin_routes(app):
    @app.route('/api/admin/bootstrap/complete', methods=['POST'])
    def complete_temporary_admin_setup():
        claims, auth_error = require_admin_access(allow_temporary_admin=True)
        if auth_error:
            return auth_error
        if not is_temporary_admin_claims(claims):
            return jsonify({'error': 'Temporary admin setup is not required for this account'}), 400

        payload = request.get_json(silent=True) or {}
        username = normalize_username(payload.get('username'))
        password = str(payload.get('password') or '')
        display_name = normalize_display_name(payload.get('displayName') or username, username)

        if len(username) < 3:
            return jsonify({'error': 'Username must be at least 3 characters'}), 400
        if len(password) < MIN_PASSWORD_LENGTH:
            return jsonify({'error': f'Password must be at least {MIN_PASSWORD_LENGTH} characters'}), 400

        try:
            if has_admin_account():
                clear_temporary_admin_state()
                return jsonify({'error': 'A persisted admin account already exists'}), 409
            if find_registered_user(username):
                return jsonify({'error': 'This username is already registered'}), 409
            if find_registered_user(_build_admin_email(username)):
                return jsonify({'error': 'This admin email is already registered'}), 409

            password_state = hash_password(password)
            admin_record = {
                'id': f'admin-{username}',
                'email': _build_admin_email(username),
                'username': username,
                'displayName': display_name,
                'role': ADMIN_USER_ROLE,
                'credits': DEFAULT_INITIAL_CREDITS,
                'passwordHash': password_state['hash'],
                'passwordSalt': password_state['salt'],
                'passwordIterations': password_state['iterations'],
                'createdAt': claims.get('iat') or 0,
            }
            create_registered_user(admin_record)
            clear_temporary_admin_state()
            return jsonify(build_token_pair(public_user_from_record(admin_record))), 201
        except DuplicateUserError:
            return jsonify({'error': 'This username is already registered'}), 409
        except AuthStoreError:
            return _auth_store_error_response()

    @app.route('/api/admin/overview', methods=['GET'])
    def get_admin_overview():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error

        try:
            recent_requests = list_recent_request_records(8)
        except RequestStoreError:
            return _request_store_error_response()

        try:
            return jsonify({
                'summary': get_auth_user_summary(),
                'recentRequests': [_serialize_request_record(record) for record in recent_requests],
            })
        except AuthStoreError:
            return _auth_store_error_response()

    @app.route('/api/admin/users', methods=['GET'])
    def list_admin_users_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error

        page = _safe_page(request.args.get('page'), default=1)
        page_size = _safe_page_size(request.args.get('pageSize') or request.args.get('limit'), default=10)
        search_term = str(request.args.get('search') or request.args.get('q') or '').strip()
        try:
            paginated_users = list_auth_users_page(page=page, page_size=page_size, search_term=search_term)
            return jsonify({
                'summary': get_auth_user_summary(),
                'users': [_serialize_admin_user(user) for user in paginated_users['users']],
                'pagination': paginated_users['pagination'],
                'search': paginated_users.get('search') or '',
            })
        except AuthStoreError:
            return _auth_store_error_response()

    @app.route('/api/admin/users/<string:user_id>', methods=['GET', 'PATCH'])
    def update_admin_user_route(user_id):
        if request.method == 'GET':
            _claims, auth_error = require_admin_access()
            if auth_error:
                return auth_error

            try:
                return jsonify({'user': _serialize_admin_user(get_auth_user(user_id))})
            except UserNotFoundError:
                return jsonify({'error': 'User not found'}), 404
            except AuthStoreError:
                return _auth_store_error_response()

        claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error

        payload = request.get_json(silent=True) or {}
        next_role = payload.get('role') if 'role' in payload else None
        next_credits = payload.get('credits') if 'credits' in payload else None
        next_is_premium = payload.get('isPremium') if 'isPremium' in payload else None
        next_is_locked = payload.get('isLocked') if 'isLocked' in payload else None
        if next_role is None and next_credits is None and next_is_premium is None and next_is_locked is None:
            return jsonify({'error': 'No admin changes were provided'}), 400
        if claims.get('sub') == user_id and next_role == 'user':
            return jsonify({'error': 'You cannot remove your own admin role from the active session'}), 400

        try:
            updated_user = update_auth_user_admin_fields(
                user_id,
                role=next_role,
                credits=next_credits,
                is_premium=next_is_premium,
                is_locked=next_is_locked,
                actor_user_id=claims.get('sub'),
            )
            return jsonify({'user': _serialize_admin_user(updated_user)})
        except UserNotFoundError:
            return jsonify({'error': 'User not found'}), 404
        except AdminAccountLockError:
            return jsonify({'error': 'Admin accounts cannot be locked'}), 400
        except LastAdminRemovalError:
            return jsonify({'error': 'At least one admin account is required'}), 400
        except AuthStoreError:
            return _auth_store_error_response()

    @app.route('/api/admin/users/<string:user_id>/requests', methods=['GET'])
    def list_admin_user_requests_route(user_id):
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error

        page = _safe_page(request.args.get('page'), default=1)
        page_size = _safe_page_size(request.args.get('pageSize'), default=10)
        try:
            get_auth_user(user_id)
            request_page = list_user_request_records_page(user_id, page=page, page_size=page_size)
            return jsonify({
                'requests': [_serialize_request_record(record) for record in request_page['requests']],
                'pagination': request_page['pagination'],
            })
        except UserNotFoundError:
            return jsonify({'error': 'User not found'}), 404
        except RequestStoreError:
            return _request_store_error_response()
        except AuthStoreError:
            return _auth_store_error_response()

    @app.route('/api/admin/users/<string:user_id>/credits/history', methods=['GET'])
    def list_admin_user_credit_history_route(user_id):
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error

        page = _safe_page(request.args.get('page'), default=1)
        page_size = _safe_page_size(request.args.get('pageSize'), default=10)
        try:
            get_auth_user(user_id)
            history_page = list_user_credit_history_page(user_id, page=page, page_size=page_size)
            return jsonify({
                'history': [_serialize_credit_event(record) for record in history_page['history']],
                'pagination': history_page['pagination'],
            })
        except UserNotFoundError:
            return jsonify({'error': 'User not found'}), 404
        except AuthStoreError:
            return _auth_store_error_response()

    @app.route('/api/admin/users/<string:user_id>/credits/add', methods=['POST'])
    def add_admin_user_credits_route(user_id):
        claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error

        payload = request.get_json(silent=True) or {}
        amount = abs(_to_int(payload.get('amount'), 0))
        note = str(payload.get('note') or '').strip()
        if amount <= 0:
            return jsonify({'error': 'Credit amount must be greater than 0'}), 400

        try:
            get_auth_user(user_id)
            updated_user = add_user_credits(
                user_id,
                amount,
                actor_user_id=claims.get('sub'),
                note=note or 'Admin added credits',
                details={'source': 'admin-user-detail', 'amount': amount},
            )
            history_page = list_user_credit_history_page(user_id, page=1, page_size=1)
            history_entry = (history_page.get('history') or [None])[0]
            return jsonify({
                'user': _serialize_admin_user(updated_user),
                'historyEntry': _serialize_credit_event(history_entry) if history_entry else None,
            }), 201
        except UserNotFoundError:
            return jsonify({'error': 'User not found'}), 404
        except AuthStoreError:
            return _auth_store_error_response()

    @app.route('/api/admin/requests', methods=['GET'])
    def list_admin_requests_route():
        _claims, auth_error = require_admin_access()
        if auth_error:
            return auth_error

        limit = request.args.get('limit')
        try:
            records = list_recent_request_records(_safe_request_limit(limit, default=50))
            return jsonify({'requests': [_serialize_request_record(record) for record in records]})
        except RequestStoreError:
            return _request_store_error_response()
