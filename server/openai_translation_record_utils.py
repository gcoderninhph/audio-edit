import json


def safe_bool(value, default_value=True):
    if value is None:
        return bool(default_value)
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() not in {'0', 'false', 'off', 'no', ''}


def safe_float(value, default_value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default_value)


def safe_int(value, default_value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return int(default_value)


def token_preview(secret):
    text = str(secret or '').strip()
    if not text:
        return ''
    if len(text) <= 8:
        return '*' * len(text)
    return f'{text[:3]}...{text[-5:]}'


def serialize_token(row, include_secret=False):
    if not row:
        return None
    payload = {
        'id': int(row.get('id') or 0),
        'name': row.get('name') or '',
        'isActive': bool(row.get('is_active')),
        'tokenPreview': token_preview(row.get('api_key')),
        'createdAt': float(row.get('created_at') or 0),
        'updatedAt': float(row.get('updated_at') or 0),
        'lastUsedAt': float(row.get('last_used_at') or 0),
    }
    if include_secret:
        payload['token'] = row.get('api_key') or ''
    return payload


def serialize_config(row, *, defaults, legacy_default_model=''):
    safe_defaults = dict(defaults or {})
    if not row:
        return safe_defaults
    default_model = safe_defaults.get('model') or ''
    model_value = str(row.get('model') or default_model).strip() or default_model
    if legacy_default_model and model_value == legacy_default_model:
        model_value = default_model
    return {
        'apiBaseUrl': str(row.get('api_base_url') or safe_defaults.get('apiBaseUrl') or '').strip() or safe_defaults.get('apiBaseUrl') or '',
        'model': model_value,
        'systemPrompt': str(row.get('system_prompt') or safe_defaults.get('systemPrompt') or ''),
        'promptTemplate': str(row.get('prompt_template') or safe_defaults.get('promptTemplate') or ''),
        'temperature': safe_float(row.get('temperature'), safe_defaults.get('temperature') or 0.0),
        'timeoutSeconds': max(10, min(600, safe_int(row.get('timeout_seconds'), safe_defaults.get('timeoutSeconds') or 120))),
    }


def sanitize_openai_request_details(details):
    safe_details = dict(details or {})
    removed = 'systemPrompt' in safe_details
    if removed:
        safe_details.pop('systemPrompt', None)
    return safe_details, removed


def scrub_openai_request_detail_row(connection, row, *, request_type, provider):
    safe_details, removed = sanitize_openai_request_details(
        json.loads(row.get('details_json') or '{}') if str(row.get('details_json') or '').strip() else {}
    )
    if not removed:
        return safe_details
    with connection.cursor() as cursor:
        cursor.execute(
            'UPDATE server_requests SET details_json = %s WHERE request_id = %s AND request_type = %s AND provider = %s',
            (
                json.dumps(safe_details, ensure_ascii=False, separators=(',', ':')),
                row.get('request_id') or '',
                request_type,
                provider,
            ),
        )
    return safe_details


def row_to_request_record(row):
    if not row:
        return None
    details_json = row.get('details_json')
    try:
        details = json.loads(details_json) if details_json else {}
    except json.JSONDecodeError:
        details = {}
    details, _removed = sanitize_openai_request_details(details)
    return {
        'request_id': row.get('request_id') or '',
        'user_id': row.get('user_id') or '',
        'request_type': row.get('request_type') or '',
        'provider': row.get('provider') or '',
        'status': row.get('status') or '',
        'source_file_name': row.get('source_file_name') or '',
        'target_language': row.get('target_language') or '',
        'output_file_name': row.get('output_file_name') or '',
        'details': details,
        'created_at': float(row.get('created_at') or 0),
        'updated_at': float(row.get('updated_at') or 0),
    }