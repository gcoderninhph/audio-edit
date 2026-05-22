from urllib.parse import urlparse

try:
    from auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _require_driver
    from vbee_schema import ensure_vbee_schema, json_dumps, json_loads, mask_secret, normalize_bool, normalize_positive_int, normalize_text, now_timestamp, VBEE_STATUS_COMPLETE, VBEE_STATUS_PROCESSING, VbeeNotFoundError
    from vbee_voice_catalog import get_default_vbee_enabled_language_codes, normalize_vbee_enabled_language_codes
except ImportError:
    from .auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _require_driver
    from .vbee_schema import ensure_vbee_schema, json_dumps, json_loads, mask_secret, normalize_bool, normalize_positive_int, normalize_text, now_timestamp, VBEE_STATUS_COMPLETE, VBEE_STATUS_PROCESSING, VbeeNotFoundError
    from .vbee_voice_catalog import get_default_vbee_enabled_language_codes, normalize_vbee_enabled_language_codes


def _row_to_token(row, include_secret=False, stats=None):
    if not row:
        return None
    token = {
        'id': int(row.get('id') or 0),
        'name': row.get('name') or '',
        'clientId': row.get('client_id') or '',
        'tokenPreview': mask_secret(row.get('token_secret') or ''),
        'maxConcurrentRequests': int(row.get('max_concurrent_requests') or 1),
        'isActive': bool(row.get('is_active') or 0),
        'createdAt': int(row.get('created_at') or 0),
        'updatedAt': int(row.get('updated_at') or 0),
        'stats': stats or {},
    }
    if include_secret:
        token['token'] = row.get('token_secret') or ''
    return token


def _token_stats(cursor, token_id):
    cursor.execute(
        'SELECT COUNT(DISTINCT request_id) AS count_value, COALESCE(SUM(character_count), 0) AS char_count FROM vbee_voice_segments WHERE token_id = %s AND status = %s',
        (token_id, VBEE_STATUS_COMPLETE),
    )
    completed = cursor.fetchone() or {}
    cursor.execute(
        'SELECT request_id, segment_index, character_count, provider_request_id FROM vbee_voice_segments WHERE token_id = %s AND status = %s ORDER BY updated_at DESC LIMIT 20',
        (token_id, VBEE_STATUS_PROCESSING),
    )
    return {
        'processedRequestCount': int(completed.get('count_value') or 0),
        'processedCharacterCount': int(completed.get('char_count') or 0),
        'processingRequests': [{
            'requestId': row.get('request_id') or '',
            'segmentIndex': int(row.get('segment_index') or 0),
            'characterCount': int(row.get('character_count') or 0),
            'providerRequestId': row.get('provider_request_id') or '',
        } for row in cursor.fetchall() or []],
    }


def list_vbee_tokens():
    ensure_vbee_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM vbee_tokens ORDER BY is_active DESC, updated_at DESC, id DESC')
                rows = cursor.fetchall() or []
                return [_row_to_token(row, stats=_token_stats(cursor, row['id'])) for row in rows]
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list Vbee tokens') from error


def get_vbee_token(token_id, include_secret=False):
    ensure_vbee_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM vbee_tokens WHERE id = %s LIMIT 1', (int(token_id),))
                row = cursor.fetchone()
                if not row:
                    raise VbeeNotFoundError('Vbee token not found')
                return _row_to_token(row, include_secret=include_secret, stats=_token_stats(cursor, row['id']))
        finally:
            connection.close()
    except VbeeNotFoundError:
        raise
    except (driver.MySQLError, ValueError) as error:
        raise AuthStoreError('Unable to load Vbee token') from error


def create_vbee_token(payload):
    ensure_vbee_schema()
    name = normalize_text(payload.get('name'), 'Token name', max_length=120)
    client_id = normalize_text(payload.get('clientId'), 'Client id', max_length=160, required=False)
    token_secret = normalize_text(payload.get('token'), 'Token', max_length=4096)
    max_concurrent = normalize_positive_int(payload.get('maxConcurrentRequests'), 'Max concurrent requests')
    is_active = normalize_bool(payload.get('isActive'), default=True)
    now = now_timestamp()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    'INSERT INTO vbee_tokens (name, client_id, token_secret, max_concurrent_requests, is_active, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s, %s)',
                    (name, client_id, token_secret, max_concurrent, 1 if is_active else 0, now, now),
                )
                token_id = cursor.lastrowid
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to create Vbee token') from error
    return get_vbee_token(token_id)


def update_vbee_token(token_id, payload):
    current = get_vbee_token(token_id, include_secret=True)
    name = current['name'] if 'name' not in payload else normalize_text(payload.get('name'), 'Token name', max_length=120)
    client_id = current['clientId'] if 'clientId' not in payload else normalize_text(payload.get('clientId'), 'Client id', max_length=160, required=False)
    token_secret = current.get('token') or '' if not payload.get('token') else normalize_text(payload.get('token'), 'Token', max_length=4096)
    max_concurrent = current['maxConcurrentRequests'] if 'maxConcurrentRequests' not in payload else normalize_positive_int(payload.get('maxConcurrentRequests'), 'Max concurrent requests')
    is_active = current['isActive'] if 'isActive' not in payload else normalize_bool(payload.get('isActive'), default=True)
    now = now_timestamp()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    'UPDATE vbee_tokens SET name = %s, client_id = %s, token_secret = %s, max_concurrent_requests = %s, is_active = %s, updated_at = %s WHERE id = %s',
                    (name, client_id, token_secret, max_concurrent, 1 if is_active else 0, now, current['id']),
                )
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to update Vbee token') from error
    return get_vbee_token(current['id'])


def delete_vbee_token(token_id):
    token = get_vbee_token(token_id)
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('DELETE FROM vbee_tokens WHERE id = %s', (token['id'],))
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to delete Vbee token') from error
    return token


def get_vbee_config():
    ensure_vbee_schema()
    config = {
        'apiBaseUrl': 'https://vbee.vn/api/v1/tts',
        'audioType': 'wav',
        'defaultLanguage': 'vi',
        'defaultVoiceCode': '',
        'enabledLanguageCodes': get_default_vbee_enabled_language_codes(),
        'webhookHost': '',
        'webhookSecret': '',
    }
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT config_key, config_value FROM vbee_configs')
                for row in cursor.fetchall() or []:
                    config_key = row['config_key']
                    config_value = row.get('config_value') or ''
                    if config_key == 'enabledLanguageCodes':
                        parsed_value = json_loads(config_value, config_value)
                        config[config_key] = normalize_vbee_enabled_language_codes(parsed_value, fallback=get_default_vbee_enabled_language_codes(), allow_empty=True)
                        continue
                    config[config_key] = config_value
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to load Vbee config') from error
    return config


def update_vbee_config(payload):
    allowed_keys = {'apiBaseUrl', 'audioType', 'defaultLanguage', 'defaultVoiceCode', 'enabledLanguageCodes', 'webhookHost', 'webhookSecret'}
    now = now_timestamp()
    driver = _require_driver()
    ensure_vbee_schema()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                for key in allowed_keys:
                    if key not in payload:
                        continue
                    if key == 'enabledLanguageCodes':
                        normalized_codes = normalize_vbee_enabled_language_codes(payload.get(key), allow_empty=True)
                        config_value = json_dumps(normalized_codes)
                    else:
                        config_value = str(payload.get(key) or '').strip()
                    if key == 'webhookHost' and config_value:
                        parsed_host = urlparse(config_value if '://' in config_value else f'https://{config_value}')
                        config_value = f'{parsed_host.scheme}://{parsed_host.netloc}'.rstrip('/')
                    cursor.execute(
                        'INSERT INTO vbee_configs (config_key, config_value, updated_at) VALUES (%s, %s, %s) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_at = VALUES(updated_at)',
                        (key, config_value, now),
                    )
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to update Vbee config') from error
    return get_vbee_config()


def list_active_vbee_tokens_with_capacity():
    ensure_vbee_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT t.*, COUNT(s.id) AS processing_count
                    FROM vbee_tokens t
                    LEFT JOIN vbee_voice_segments s ON s.token_id = t.id AND s.status = %s
                    WHERE t.is_active = 1
                    GROUP BY t.id
                    ORDER BY processing_count ASC, t.updated_at DESC, t.id ASC
                    """,
                    (VBEE_STATUS_PROCESSING,),
                )
                tokens = []
                for row in cursor.fetchall() or []:
                    capacity = int(row.get('max_concurrent_requests') or 1) - int(row.get('processing_count') or 0)
                    if capacity > 0:
                        tokens.append({**_row_to_token(row, include_secret=True), 'availableCapacity': capacity})
                return tokens
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list Vbee token capacity') from error