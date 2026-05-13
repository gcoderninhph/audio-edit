import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from flask import jsonify, request

try:
    from auth_store import (
        AuthStoreError,
        DuplicateUserError,
        cleanup_refresh_tokens as cleanup_stored_refresh_tokens,
        create_registered_user,
        find_registered_user,
        get_refresh_token,
        revoke_refresh_token,
        store_refresh_token,
    )
except ImportError:
    from .auth_store import (
        AuthStoreError,
        DuplicateUserError,
        cleanup_refresh_tokens as cleanup_stored_refresh_tokens,
        create_registered_user,
        find_registered_user,
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


def base64url_encode(raw_bytes):
    return base64.urlsafe_b64encode(raw_bytes).rstrip(b'=').decode('ascii')


def base64url_decode(value):
    padded_value = value + ('=' * (-len(value) % 4))
    return base64.urlsafe_b64decode(padded_value.encode('ascii'))


def get_current_timestamp():
    return int(time.time())


def get_local_user():
    return {
        'id': AUTH_USER_ID,
        'email': AUTH_USERNAME.lower(),
        'displayName': AUTH_DISPLAY_NAME,
    }


def normalize_email(email):
    return str(email or '').strip().lower()


def normalize_display_name(display_name, email):
    normalized_name = str(display_name or '').strip()
    if normalized_name:
        return normalized_name[:80]
    return email.split('@', 1)[0] if '@' in email else 'Editor'


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


def public_user_from_record(user_record):
    return {
        'id': user_record['id'],
        'email': user_record['email'],
        'displayName': user_record.get('displayName') or normalize_display_name('', user_record['email']),
    }


def get_user_for_credentials(email, password):
    normalized_email = normalize_email(email)
    if hmac.compare_digest(normalized_email, normalize_email(AUTH_USERNAME)) \
            and hmac.compare_digest(str(password or ''), AUTH_PASSWORD):
        return get_local_user()

    registered_user = find_registered_user(normalized_email)
    if registered_user and verify_password(password, registered_user):
        return public_user_from_record(registered_user)

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
        'email': user['email'],
        'displayName': user['displayName'],
        'iat': now,
        'exp': access_expires_at,
    })
    refresh_token = encode_jwt({
        'type': 'refresh',
        'sub': user['id'],
        'email': user['email'],
        'displayName': user['displayName'],
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
        return get_access_token_claims(), None
    except ValueError:
        return None, (jsonify({'error': 'Login is required to use this feature'}), 401)


def get_json_payload():
    return request.get_json(silent=True) or {}


def is_valid_login(email, password):
    try:
        return get_user_for_credentials(email, password) is not None
    except AuthStoreError:
        return False


def auth_store_error_response():
    return jsonify({'error': 'Authentication database is unavailable'}), 503


def register_auth_routes(app):
    @app.route('/api/auth/login', methods=['POST'])
    def login():
        payload = get_json_payload()
        email = payload.get('email') or payload.get('username')
        password = payload.get('password')

        try:
            user = get_user_for_credentials(email, password)
            if not user:
                return jsonify({'error': 'Invalid email or password'}), 401

            return jsonify(build_token_pair(user))
        except AuthStoreError:
            return auth_store_error_response()

    @app.route('/api/auth/register', methods=['POST'])
    def register():
        payload = get_json_payload()
        email = normalize_email(payload.get('email'))
        password = str(payload.get('password') or '')
        display_name = normalize_display_name(payload.get('displayName') or payload.get('name'), email)

        if '@' not in email or len(email) > 160:
            return jsonify({'error': 'Enter a valid email address'}), 400

        if len(password) < MIN_PASSWORD_LENGTH:
            return jsonify({'error': f'Password must be at least {MIN_PASSWORD_LENGTH} characters'}), 400

        try:
            if normalize_email(AUTH_USERNAME) == email or find_registered_user(email):
                return jsonify({'error': 'This email is already registered'}), 409

            password_state = hash_password(password)
            user_record = {
                'id': f'user-{secrets.token_urlsafe(12)}',
                'email': email,
                'displayName': display_name,
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
            return jsonify(build_token_pair({
                'id': claims.get('sub') or AUTH_USER_ID,
                'email': claims.get('email') or AUTH_USERNAME.lower(),
                'displayName': claims.get('displayName') or AUTH_DISPLAY_NAME,
            }))
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

        return jsonify({
            'user': {
                'id': claims.get('sub') or AUTH_USER_ID,
                'email': claims.get('email') or AUTH_USERNAME.lower(),
                'displayName': claims.get('displayName') or AUTH_DISPLAY_NAME,
            },
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