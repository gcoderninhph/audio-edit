import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from flask import jsonify, request

try:
    from admin_bootstrap import announce_temporary_admin_account, get_temporary_admin_user, is_temporary_admin_claims
    from auth_identity import get_current_user_state, normalize_display_name, normalize_username, public_user_from_record
    from auth_store import (
        ADMIN_USER_ROLE,
        DEFAULT_INITIAL_CREDITS,
        DEFAULT_USER_ROLE,
        AuthStoreError,
        DuplicateUserError,
        cleanup_refresh_tokens as cleanup_stored_refresh_tokens,
        create_registered_user,
        find_registered_user,
        find_user_by_id,
        get_refresh_token,
        revoke_refresh_token,
        store_refresh_token,
    )
except ImportError:
    from .admin_bootstrap import announce_temporary_admin_account, get_temporary_admin_user, is_temporary_admin_claims
    from .auth_identity import get_current_user_state, normalize_display_name, normalize_username, public_user_from_record
    from .auth_store import (
        ADMIN_USER_ROLE,
        DEFAULT_INITIAL_CREDITS,
        DEFAULT_USER_ROLE,
        AuthStoreError,
        DuplicateUserError,
        cleanup_refresh_tokens as cleanup_stored_refresh_tokens,
        create_registered_user,
        find_registered_user,
        find_user_by_id,
        get_refresh_token,
        revoke_refresh_token,
        store_refresh_token,
    )


ACCESS_TOKEN_TTL_SECONDS = int(os.environ.get('AUTH_ACCESS_TOKEN_TTL_SECONDS', '900'))
REFRESH_TOKEN_TTL_SECONDS = int(os.environ.get('AUTH_REFRESH_TOKEN_TTL_SECONDS', '604800'))
AUTH_JWT_SECRET = os.environ.get('AUTH_JWT_SECRET', 'audio-edit-local-dev-secret')
AUTH_USER_ID = os.environ.get('AUTH_USER_ID', 'local-user')
AUTH_USERNAME = os.environ.get('AUTH_USERNAME', 'demo@local')
AUTH_PASSWORD = os.environ.get('AUTH_PASSWORD', 'demo123')
AUTH_DISPLAY_NAME = os.environ.get('AUTH_DISPLAY_NAME', 'Local Editor')
PASSWORD_HASH_ITERATIONS = int(os.environ.get('AUTH_PASSWORD_HASH_ITERATIONS', '200000'))
MIN_PASSWORD_LENGTH = 6
LOCKED_ACCOUNT_ERROR = 'This account has been locked'


class LockedAccountError(ValueError):
    pass


def base64url_encode(raw_bytes):
    return base64.urlsafe_b64encode(raw_bytes).rstrip(b'=').decode('ascii')


def base64url_decode(value):
    padded_value = value + ('=' * (-len(value) % 4))
    return base64.urlsafe_b64decode(padded_value.encode('ascii'))


def get_current_timestamp():
    return int(time.time())


def get_local_user():
    try:
        stored_local_user = find_user_by_id(AUTH_USER_ID)
    except AuthStoreError:
        stored_local_user = None

    if stored_local_user:
        return public_user_from_record(stored_local_user)

    return {
        'id': AUTH_USER_ID,
        'credits': DEFAULT_INITIAL_CREDITS,
        'email': AUTH_USERNAME.lower(),
        'isLocked': False,
        'isPremium': False,
        'premiumStartAt': 0,
        'premiumEndAt': 0,
        'role': DEFAULT_USER_ROLE,
        'username': normalize_username(AUTH_USERNAME.split('@', 1)[0]),
        'displayName': AUTH_DISPLAY_NAME,
        'isTemporaryAdmin': False,
        'mustSetupAdmin': False,
    }


def normalize_email(email):
    return str(email or '').strip().lower()


def hash_password(password, salt=None):
    safe_salt = salt or secrets.token_urlsafe(18)
    password_hash = hashlib.pbkdf2_hmac(
        'sha256',
        str(password or '').encode('utf-8'),
        safe_salt.encode('utf-8'),
        PASSWORD_HASH_ITERATIONS,
    )
    return {
        'salt': safe_salt,
        'hash': base64url_encode(password_hash),
        'iterations': PASSWORD_HASH_ITERATIONS,
    }


def verify_password(password, user_record):
    expected_hash = str(user_record.get('passwordHash') or '')
    salt = str(user_record.get('passwordSalt') or '')
    iterations = int(user_record.get('passwordIterations') or PASSWORD_HASH_ITERATIONS)
    if not expected_hash or not salt:
        return False

    password_hash = hashlib.pbkdf2_hmac(
        'sha256',
        str(password or '').encode('utf-8'),
        salt.encode('utf-8'),
        iterations,
    )
    return hmac.compare_digest(base64url_encode(password_hash), expected_hash)


def ensure_user_is_unlocked(user):
    if user and bool(user.get('isLocked')) and not bool(user.get('isTemporaryAdmin')):
        raise LockedAccountError(LOCKED_ACCOUNT_ERROR)
    return user


def get_current_user_from_claims(claims):
    return get_current_user_state(
        claims.get('sub') or AUTH_USER_ID,
        claims.get('email') or AUTH_USERNAME.lower(),
        claims.get('displayName') or AUTH_DISPLAY_NAME,
        claims.get('credits') or DEFAULT_INITIAL_CREDITS,
        bool(claims.get('isPremium')),
        claims.get('role') or DEFAULT_USER_ROLE,
        claims.get('username') or '',
        is_temporary_admin=is_temporary_admin_claims(claims),
        must_setup_admin=bool(claims.get('mustSetupAdmin')),
    )


def get_user_for_credentials(email, password):
    normalized_identifier = normalize_email(email)
    if hmac.compare_digest(normalized_identifier, normalize_email(AUTH_USERNAME)) \
            and hmac.compare_digest(str(password or ''), AUTH_PASSWORD):
        return ensure_user_is_unlocked(get_local_user())

    temporary_admin_user = get_temporary_admin_user(normalized_identifier, password)
    if temporary_admin_user:
        return temporary_admin_user

    registered_user = find_registered_user(normalized_identifier)
    if registered_user and verify_password(password, registered_user):
        return ensure_user_is_unlocked(public_user_from_record(registered_user))

    return None


def sign_token(message):
    return hmac.new(
        AUTH_JWT_SECRET.encode('utf-8'),
        message.encode('ascii'),
        hashlib.sha256,
    ).digest()


def encode_jwt(payload):
    header = {'alg': 'HS256', 'typ': 'JWT'}
    header_segment = base64url_encode(json.dumps(header, separators=(',', ':')).encode('utf-8'))
    payload_segment = base64url_encode(json.dumps(payload, separators=(',', ':')).encode('utf-8'))
    signing_input = f'{header_segment}.{payload_segment}'
    signature_segment = base64url_encode(sign_token(signing_input))
    return f'{signing_input}.{signature_segment}'


def decode_jwt(token):
    if not token or token.count('.') != 2:
        raise ValueError('Invalid token')

    header_segment, payload_segment, signature_segment = token.split('.', 2)
    signing_input = f'{header_segment}.{payload_segment}'
    expected_signature = base64url_encode(sign_token(signing_input))
    if not hmac.compare_digest(expected_signature, signature_segment):
        raise ValueError('Invalid token signature')

    payload = json.loads(base64url_decode(payload_segment).decode('utf-8'))
    if int(payload.get('exp') or 0) <= get_current_timestamp():
        raise ValueError('Token expired')
    return payload


def cleanup_refresh_tokens():
    cleanup_stored_refresh_tokens(get_current_timestamp())


def build_token_pair(user):
    cleanup_refresh_tokens()
    now = get_current_timestamp()
    access_expires_at = now + ACCESS_TOKEN_TTL_SECONDS
    refresh_expires_at = now + REFRESH_TOKEN_TTL_SECONDS
    refresh_token_id = secrets.token_urlsafe(24)

    access_token = encode_jwt({
        'type': 'access',
        'sub': user['id'],
        'credits': max(0, int(user.get('credits') or 0)),
        'email': user['email'],
        'isLocked': bool(user.get('isLocked')),
        'isPremium': bool(user.get('isPremium')),
        'role': user.get('role') or DEFAULT_USER_ROLE,
        'username': user.get('username') or '',
        'displayName': user['displayName'],
        'isTemporaryAdmin': bool(user.get('isTemporaryAdmin')),
        'mustSetupAdmin': bool(user.get('mustSetupAdmin')),
        'iat': now,
        'exp': access_expires_at,
    })
    refresh_token = encode_jwt({
        'type': 'refresh',
        'sub': user['id'],
        'credits': max(0, int(user.get('credits') or 0)),
        'email': user['email'],
        'isLocked': bool(user.get('isLocked')),
        'isPremium': bool(user.get('isPremium')),
        'role': user.get('role') or DEFAULT_USER_ROLE,
        'username': user.get('username') or '',
        'displayName': user['displayName'],
        'isTemporaryAdmin': bool(user.get('isTemporaryAdmin')),
        'mustSetupAdmin': bool(user.get('mustSetupAdmin')),
        'jti': refresh_token_id,
        'iat': now,
        'exp': refresh_expires_at,
    })
    store_refresh_token(refresh_token_id, user['id'], refresh_expires_at, now)

    return {
        'user': user,
        'accessToken': access_token,
        'refreshToken': refresh_token,
        'accessTokenExpiresAt': access_expires_at,
        'refreshTokenExpiresAt': refresh_expires_at,
    }


def get_bearer_token():
    authorization_header = request.headers.get('Authorization', '')
    if not authorization_header.lower().startswith('bearer '):
        return ''
    return authorization_header.split(' ', 1)[1].strip()


def get_access_token_claims():
    claims = decode_jwt(get_bearer_token())
    if claims.get('type') != 'access':
        raise ValueError('Invalid access token')
    return claims


def require_access_token():
    try:
        claims = get_access_token_claims()
        ensure_user_is_unlocked(get_current_user_from_claims(claims))
        return claims, None
    except LockedAccountError as error:
        return None, (jsonify({'error': str(error)}), 403)
    except AuthStoreError:
        return None, auth_store_error_response()
    except ValueError:
        return None, (jsonify({'error': 'Login is required to use this feature'}), 401)


def require_admin_access(allow_temporary_admin=False):
    claims, auth_error = require_access_token()
    if auth_error:
        return None, auth_error

    is_admin = claims.get('role') == ADMIN_USER_ROLE
    is_temporary = is_temporary_admin_claims(claims)
    if not is_admin:
        return None, (jsonify({'error': 'Admin access is required'}), 403)
    if is_temporary and not allow_temporary_admin:
        return None, (jsonify({'error': 'Complete temporary admin setup before opening the admin console'}), 403)
    return claims, None


def get_json_payload():
    return request.get_json(silent=True) or {}


def is_valid_login(email, password):
    try:
        return get_user_for_credentials(email, password) is not None
    except (AuthStoreError, LockedAccountError):
        return False


def auth_store_error_response():
    return jsonify({'error': 'Authentication database is unavailable'}), 503


def register_auth_routes(app):
    announce_temporary_admin_account()

    @app.route('/api/auth/login', methods=['POST'])
    def login():
        payload = get_json_payload()
        email = payload.get('email') or payload.get('username') or payload.get('identifier')
        password = payload.get('password')

        try:
            user = get_user_for_credentials(email, password)
            if not user:
                return jsonify({'error': 'Invalid email or password'}), 401

            return jsonify(build_token_pair(user))
        except LockedAccountError as error:
            return jsonify({'error': str(error)}), 403
        except AuthStoreError:
            return auth_store_error_response()

    @app.route('/api/auth/register', methods=['POST'])
    def register():
        payload = get_json_payload()
        email = normalize_email(payload.get('email'))
        username = normalize_username(payload.get('username'))
        password = str(payload.get('password') or '')
        display_name = normalize_display_name(payload.get('displayName') or payload.get('name'), email)

        if '@' not in email or len(email) > 160:
            return jsonify({'error': 'Enter a valid email address'}), 400

        if len(password) < MIN_PASSWORD_LENGTH:
            return jsonify({'error': f'Password must be at least {MIN_PASSWORD_LENGTH} characters'}), 400

        if payload.get('username') and not username:
            return jsonify({'error': 'Username may only contain letters, numbers, dots, dashes, or underscores'}), 400

        try:
            if normalize_email(AUTH_USERNAME) == email or find_registered_user(email):
                return jsonify({'error': 'This email is already registered'}), 409
            if username and find_registered_user(username):
                return jsonify({'error': 'This username is already registered'}), 409

            password_state = hash_password(password)
            user_record = {
                'id': f'user-{secrets.token_urlsafe(12)}',
                'email': email,
                'credits': DEFAULT_INITIAL_CREDITS,
                'displayName': display_name,
                'role': DEFAULT_USER_ROLE,
                'username': username or None,
                'passwordHash': password_state['hash'],
                'passwordSalt': password_state['salt'],
                'passwordIterations': password_state['iterations'],
                'createdAt': get_current_timestamp(),
            }
            create_registered_user(user_record)

            return jsonify(build_token_pair(public_user_from_record(user_record))), 201
        except DuplicateUserError:
            return jsonify({'error': 'This email is already registered'}), 409
        except AuthStoreError:
            return auth_store_error_response()

    @app.route('/api/auth/refresh', methods=['POST'])
    def refresh():
        payload = get_json_payload()
        refresh_token = str(payload.get('refreshToken') or '').strip()

        try:
            claims = decode_jwt(refresh_token)
        except ValueError:
            return jsonify({'error': 'Invalid refresh token'}), 401

        try:
            token_id = claims.get('jti')
            token_state = get_refresh_token(token_id, get_current_timestamp())
            if claims.get('type') != 'refresh' or not token_state or token_state.get('userId') != claims.get('sub'):
                return jsonify({'error': 'Refresh token was revoked'}), 401

            revoke_refresh_token(token_id)
            current_user = ensure_user_is_unlocked(get_current_user_from_claims(claims))
            return jsonify(build_token_pair(current_user))
        except LockedAccountError as error:
            return jsonify({'error': str(error)}), 403
        except AuthStoreError:
            return auth_store_error_response()

    @app.route('/api/auth/me', methods=['GET'])
    def me():
        try:
            claims = decode_jwt(get_bearer_token())
        except ValueError:
            return jsonify({'error': 'Invalid access token'}), 401

        if claims.get('type') != 'access':
            return jsonify({'error': 'Invalid access token'}), 401

        try:
            current_user = ensure_user_is_unlocked(get_current_user_from_claims(claims))
        except LockedAccountError as error:
            return jsonify({'error': str(error)}), 403
        except AuthStoreError:
            return auth_store_error_response()

        return jsonify({
            'user': current_user,
            'accessTokenExpiresAt': claims.get('exp'),
        })

    @app.route('/api/auth/logout', methods=['POST'])
    def logout():
        payload = get_json_payload()
        refresh_token = str(payload.get('refreshToken') or '').strip()
        try:
            claims = decode_jwt(refresh_token)
            revoke_refresh_token(claims.get('jti'))
        except ValueError:
            pass
        except AuthStoreError:
            return auth_store_error_response()
        return jsonify({'status': 'ok'})