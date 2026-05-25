from urllib.parse import urlparse

try:
    from services.auth_store import AuthStoreError, _require_driver
    from repositories.vbee_token_repository import (
        count_vbee_token_completed_stats,
        delete_vbee_token_row,
        get_vbee_token_row,
        insert_vbee_token_row,
        list_active_vbee_token_rows_with_processing_count,
        list_vbee_config_rows,
        list_vbee_token_processing_rows,
        list_vbee_token_rows,
        update_vbee_token_row,
        upsert_vbee_config_row,
    )
    from utils.vbee_schema import ensure_vbee_schema, json_dumps, json_loads, mask_secret, normalize_bool, normalize_positive_int, normalize_text, now_timestamp, VBEE_STATUS_COMPLETE, VBEE_STATUS_PROCESSING, VbeeNotFoundError, VbeeValidationError
    from utils.vbee_voice_catalog import get_default_vbee_enabled_language_codes, normalize_vbee_enabled_language_codes
except ImportError:
    from .auth_store import AuthStoreError, _require_driver
    from ..repositories.vbee_token_repository import (
        count_vbee_token_completed_stats,
        delete_vbee_token_row,
        get_vbee_token_row,
        insert_vbee_token_row,
        list_active_vbee_token_rows_with_processing_count,
        list_vbee_config_rows,
        list_vbee_token_processing_rows,
        list_vbee_token_rows,
        update_vbee_token_row,
        upsert_vbee_config_row,
    )
    from ..utils.vbee_schema import ensure_vbee_schema, json_dumps, json_loads, mask_secret, normalize_bool, normalize_positive_int, normalize_text, now_timestamp, VBEE_STATUS_COMPLETE, VBEE_STATUS_PROCESSING, VbeeNotFoundError, VbeeValidationError
    from ..utils.vbee_voice_catalog import get_default_vbee_enabled_language_codes, normalize_vbee_enabled_language_codes


DEFAULT_VBEE_CREDIT_PER_CHARACTER = 1.0
DEFAULT_VBEE_CACHED_CREDIT_PER_CHARACTER = 0.0


def _normalize_credit_rate(value, field_name, default_value=0.0, strict=False):
    if value in (None, ''):
        return float(default_value)
    try:
        rate = float(value)
    except (TypeError, ValueError):
        if strict:
            raise VbeeValidationError(f'{field_name} must be a number.')
        return float(default_value)
    if rate < 0:
        if strict:
            raise VbeeValidationError(f'{field_name} must be greater than or equal to 0.')
        return float(default_value)
    return rate


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


def _token_stats(token_id):
    completed = count_vbee_token_completed_stats(token_id, VBEE_STATUS_COMPLETE)
    return {
        'processedRequestCount': int(completed.get('count_value') or 0),
        'processedCharacterCount': int(completed.get('char_count') or 0),
        'processingRequests': [{
            'requestId': row.get('request_id') or '',
            'segmentIndex': int(row.get('segment_index') or 0),
            'characterCount': int(row.get('character_count') or 0),
            'providerRequestId': row.get('provider_request_id') or '',
        } for row in list_vbee_token_processing_rows(token_id, VBEE_STATUS_PROCESSING)],
    }


def list_vbee_tokens():
    ensure_vbee_schema()
    driver = _require_driver()
    try:
        rows = list_vbee_token_rows()
        return [_row_to_token(row, stats=_token_stats(row['id'])) for row in rows]
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list Vbee tokens') from error


def get_vbee_token(token_id, include_secret=False):
    ensure_vbee_schema()
    driver = _require_driver()
    try:
        row = get_vbee_token_row(token_id)
        if not row:
            raise VbeeNotFoundError('Vbee token not found')
        return _row_to_token(row, include_secret=include_secret, stats=_token_stats(row['id']))
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
        token_id = insert_vbee_token_row(
            name,
            client_id,
            token_secret,
            max_concurrent,
            1 if is_active else 0,
            now,
        )
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
        update_vbee_token_row(
            current['id'],
            name,
            client_id,
            token_secret,
            max_concurrent,
            1 if is_active else 0,
            now,
        )
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to update Vbee token') from error
    return get_vbee_token(current['id'])


def delete_vbee_token(token_id):
    token = get_vbee_token(token_id)
    driver = _require_driver()
    try:
        delete_vbee_token_row(token['id'])
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
        'creditPerCharacter': DEFAULT_VBEE_CREDIT_PER_CHARACTER,
        'cachedCreditPerCharacter': DEFAULT_VBEE_CACHED_CREDIT_PER_CHARACTER,
        'webhookHost': '',
        'webhookSecret': '',
    }
    driver = _require_driver()
    try:
        for row in list_vbee_config_rows():
            config_key = row['config_key']
            config_value = row.get('config_value') or ''
            if config_key == 'enabledLanguageCodes':
                parsed_value = json_loads(config_value, config_value)
                config[config_key] = normalize_vbee_enabled_language_codes(parsed_value, fallback=get_default_vbee_enabled_language_codes(), allow_empty=True)
                continue
            if config_key == 'creditPerCharacter':
                config[config_key] = _normalize_credit_rate(config_value, 'Credit per character', DEFAULT_VBEE_CREDIT_PER_CHARACTER)
                continue
            if config_key == 'cachedCreditPerCharacter':
                config[config_key] = _normalize_credit_rate(config_value, 'Cached credit per character', DEFAULT_VBEE_CACHED_CREDIT_PER_CHARACTER)
                continue
            config[config_key] = config_value
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to load Vbee config') from error
    return config


def update_vbee_config(payload):
    allowed_keys = {'apiBaseUrl', 'audioType', 'defaultLanguage', 'defaultVoiceCode', 'enabledLanguageCodes', 'creditPerCharacter', 'cachedCreditPerCharacter', 'webhookHost', 'webhookSecret'}
    now = now_timestamp()
    driver = _require_driver()
    ensure_vbee_schema()
    try:
        for key in allowed_keys:
            if key not in payload:
                continue
            if key == 'enabledLanguageCodes':
                normalized_codes = normalize_vbee_enabled_language_codes(payload.get(key), allow_empty=True)
                config_value = json_dumps(normalized_codes)
            elif key == 'creditPerCharacter':
                config_value = str(_normalize_credit_rate(payload.get(key), 'Credit per character', DEFAULT_VBEE_CREDIT_PER_CHARACTER, strict=True))
            elif key == 'cachedCreditPerCharacter':
                config_value = str(_normalize_credit_rate(payload.get(key), 'Cached credit per character', DEFAULT_VBEE_CACHED_CREDIT_PER_CHARACTER, strict=True))
            else:
                config_value = str(payload.get(key) or '').strip()
            if key == 'webhookHost' and config_value:
                parsed_host = urlparse(config_value if '://' in config_value else f'https://{config_value}')
                config_value = f'{parsed_host.scheme}://{parsed_host.netloc}'.rstrip('/')
            upsert_vbee_config_row(key, config_value, now)
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to update Vbee config') from error
    return get_vbee_config()


def list_active_vbee_tokens_with_capacity():
    ensure_vbee_schema()
    driver = _require_driver()
    try:
        tokens = []
        for row in list_active_vbee_token_rows_with_processing_count(VBEE_STATUS_PROCESSING):
            capacity = int(row.get('max_concurrent_requests') or 1) - int(row.get('processing_count') or 0)
            if capacity > 0:
                tokens.append({**_row_to_token(row, include_secret=True), 'availableCapacity': capacity})
        return tokens
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to list Vbee token capacity') from error