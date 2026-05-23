import json
from urllib.parse import urlparse

import requests

DEFAULT_VBEE_VOICE_OWNERSHIP = 'VBEE'

VBEE_LANGUAGE_DEFINITIONS = (
    {'key': 'vietnamese', 'label': 'Vietnamese', 'code': 'vi', 'aliases': ('vi', 'vi-vn', 'vietnamese')},
    {'key': 'english', 'label': 'English', 'code': 'en', 'aliases': ('en', 'en-us', 'en-gb', 'english')},
    {'key': 'spanish', 'label': 'Spanish', 'code': 'es', 'aliases': ('es', 'es-es', 'spanish')},
    {'key': 'french', 'label': 'French', 'code': 'fr', 'aliases': ('fr', 'fr-fr', 'french')},
    {'key': 'german', 'label': 'German', 'code': 'de', 'aliases': ('de', 'de-de', 'german')},
    {'key': 'italian', 'label': 'Italian', 'code': 'it', 'aliases': ('it', 'it-it', 'italian')},
    {'key': 'portuguese', 'label': 'Portuguese', 'code': 'pt', 'aliases': ('pt', 'pt-pt', 'pt-br', 'portuguese')},
    {'key': 'russian', 'label': 'Russian', 'code': 'ru', 'aliases': ('ru', 'ru-ru', 'russian')},
    {'key': 'chinese', 'label': 'Chinese', 'code': 'zh', 'aliases': ('zh', 'zh-cn', 'zh-tw', 'chinese')},
    {'key': 'japanese', 'label': 'Japanese', 'code': 'ja', 'aliases': ('ja', 'ja-jp', 'japanese')},
    {'key': 'korean', 'label': 'Korean', 'code': 'ko', 'aliases': ('ko', 'ko-kr', 'korean')},
    {'key': 'thai', 'label': 'Thai', 'code': 'th', 'aliases': ('th', 'th-th', 'thai')},
    {'key': 'indonesian', 'label': 'Indonesian', 'code': 'id', 'aliases': ('id', 'id-id', 'indonesian')},
    {'key': 'malay', 'label': 'Malay', 'code': 'ms', 'aliases': ('ms', 'ms-my', 'malay')},
    {'key': 'filipino', 'label': 'Filipino', 'code': 'fil', 'aliases': ('fil', 'fil-ph', 'tl', 'tagalog', 'filipino')},
    {'key': 'hindi', 'label': 'Hindi', 'code': 'hi', 'aliases': ('hi', 'hi-in', 'hindi')},
    {'key': 'arabic', 'label': 'Arabic', 'code': 'ar', 'aliases': ('ar', 'ar-sa', 'arabic')},
    {'key': 'bengali', 'label': 'Bengali', 'code': 'bn', 'aliases': ('bn', 'bn-bd', 'bengali')},
    {'key': 'turkish', 'label': 'Turkish', 'code': 'tr', 'aliases': ('tr', 'tr-tr', 'turkish')},
    {'key': 'dutch', 'label': 'Dutch', 'code': 'nl', 'aliases': ('nl', 'nl-nl', 'dutch')},
    {'key': 'polish', 'label': 'Polish', 'code': 'pl', 'aliases': ('pl', 'pl-pl', 'polish')},
    {'key': 'ukrainian', 'label': 'Ukrainian', 'code': 'uk', 'aliases': ('uk', 'uk-ua', 'ukrainian')},
    {'key': 'romanian', 'label': 'Romanian', 'code': 'ro', 'aliases': ('ro', 'ro-ro', 'romanian')},
    {'key': 'czech', 'label': 'Czech', 'code': 'cs', 'aliases': ('cs', 'cs-cz', 'czech')},
    {'key': 'greek', 'label': 'Greek', 'code': 'el', 'aliases': ('el', 'el-gr', 'greek')},
    {'key': 'hebrew', 'label': 'Hebrew', 'code': 'he', 'aliases': ('he', 'he-il', 'iw', 'hebrew')},
    {'key': 'swedish', 'label': 'Swedish', 'code': 'sv', 'aliases': ('sv', 'sv-se', 'swedish')},
    {'key': 'danish', 'label': 'Danish', 'code': 'da', 'aliases': ('da', 'da-dk', 'danish')},
    {'key': 'norwegian', 'label': 'Norwegian', 'code': 'no', 'aliases': ('no', 'nb', 'nb-no', 'nn-no', 'norwegian')},
    {'key': 'finnish', 'label': 'Finnish', 'code': 'fi', 'aliases': ('fi', 'fi-fi', 'finnish')},
)

DEFAULT_VBEE_ENABLED_LANGUAGE_CODES = tuple(entry['code'] for entry in VBEE_LANGUAGE_DEFINITIONS)

_LANGUAGE_CODE_TO_LABEL = {entry['code']: entry['label'] for entry in VBEE_LANGUAGE_DEFINITIONS}
_LANGUAGE_ALIAS_TO_CODE = {}
for entry in VBEE_LANGUAGE_DEFINITIONS:
    _LANGUAGE_ALIAS_TO_CODE[entry['key']] = entry['code']
    for alias in entry['aliases']:
        _LANGUAGE_ALIAS_TO_CODE[str(alias).strip().lower()] = entry['code']


def normalize_vbee_language_code(value, fallback='vi'):
    normalized_value = str(value or '').strip().lower().replace('_', '-')
    if not normalized_value:
        return str(fallback or 'vi').strip().lower()
    if normalized_value in _LANGUAGE_ALIAS_TO_CODE:
        return _LANGUAGE_ALIAS_TO_CODE[normalized_value]
    primary_code = normalized_value.split('-', 1)[0]
    if primary_code in _LANGUAGE_CODE_TO_LABEL:
        return primary_code
    raise ValueError(f'Unsupported Vbee language: {value}')


def get_default_vbee_enabled_language_codes():
    return list(DEFAULT_VBEE_ENABLED_LANGUAGE_CODES)


def list_vbee_supported_languages():
    return [
        {
            'code': entry['code'],
            'key': entry['key'],
            'label': entry['label'],
        }
        for entry in VBEE_LANGUAGE_DEFINITIONS
    ]


def normalize_vbee_enabled_language_codes(values, fallback=None, allow_empty=False):
    if values in (None, ''):
        if fallback is not None:
            return list(fallback)
        return [] if allow_empty else get_default_vbee_enabled_language_codes()

    parsed_values = values
    if isinstance(parsed_values, str):
        stripped_value = parsed_values.strip()
        if not stripped_value:
            if fallback is not None:
                return list(fallback)
            return [] if allow_empty else get_default_vbee_enabled_language_codes()
        if stripped_value.startswith('['):
            try:
                parsed_values = json.loads(stripped_value)
            except json.JSONDecodeError:
                parsed_values = [segment.strip() for segment in stripped_value.split(',') if segment.strip()]
        else:
            parsed_values = [segment.strip() for segment in stripped_value.split(',') if segment.strip()]
    elif isinstance(parsed_values, set):
        parsed_values = list(parsed_values)
    elif not isinstance(parsed_values, (list, tuple)):
        parsed_values = [parsed_values]

    normalized_values = []
    seen_codes = set()
    for value in parsed_values:
        try:
            language_code = normalize_vbee_language_code(value)
        except ValueError:
            continue
        if language_code in seen_codes:
            continue
        seen_codes.add(language_code)
        normalized_values.append(language_code)

    if normalized_values:
        return normalized_values
    if allow_empty:
        return []
    if fallback is not None:
        return list(fallback)
    return get_default_vbee_enabled_language_codes()



def get_vbee_language_label(language_code):
    return _LANGUAGE_CODE_TO_LABEL.get(normalize_vbee_language_code(language_code), 'Unknown')



def vbee_language_matches(voice_language_code, requested_language_code):
    normalized_voice_language = str(voice_language_code or '').strip().lower().replace('_', '-')
    normalized_requested_language = normalize_vbee_language_code(requested_language_code)
    return normalized_voice_language == normalized_requested_language or normalized_voice_language.startswith(f'{normalized_requested_language}-')



def build_vbee_public_voices_url(api_base_url):
    parsed_url = urlparse(str(api_base_url or '').strip())
    if parsed_url.scheme and parsed_url.netloc:
        return f'{parsed_url.scheme}://{parsed_url.netloc}/api/public/v1/voices'
    return 'https://vbee.vn/api/public/v1/voices'


def _build_vbee_error_message(payload, fallback_message):
    if not isinstance(payload, dict):
        return fallback_message
    message_parts = []
    primary_message = str(payload.get('error_message') or payload.get('message') or payload.get('error') or '').strip()
    if primary_message:
        message_parts.append(primary_message)
    details = payload.get('details') if isinstance(payload.get('details'), list) else []
    detail_parts = []
    for detail in details[:3]:
        if isinstance(detail, dict):
            for key, value in detail.items():
                if value not in (None, ''):
                    detail_parts.append(f'{key}: {value}')
        elif detail not in (None, ''):
            detail_parts.append(str(detail))
    if detail_parts:
        message_parts.append('; '.join(detail_parts))
    combined_message = ' - '.join(part for part in message_parts if part)
    return (combined_message or fallback_message)[:500]



def _load_public_voice_page(public_voices_url, token_secret, app_id, cursor=''):
    request_headers = {
        'Accept': 'application/json',
        'Authorization': f'Bearer {token_secret}',
        'app-id': app_id,
    }
    request_params = {'voiceOwnership': DEFAULT_VBEE_VOICE_OWNERSHIP}
    if cursor:
        request_params['cursor'] = cursor
    response = requests.get(public_voices_url, headers=request_headers, params=request_params, timeout=20)
    payload = response.json() if response.content else {}
    if not response.ok:
        raise RuntimeError(_build_vbee_error_message(payload, f'Unable to load Vbee voices ({response.status_code})'))
    if payload.get('status') in (0, '0', False):
        raise RuntimeError(_build_vbee_error_message(payload, 'Unable to load Vbee voices.'))
    result = payload.get('result') if isinstance(payload.get('result'), dict) else {}
    pagination = result.get('pagination') if isinstance(result.get('pagination'), dict) else {}
    voices = result.get('voices') if isinstance(result.get('voices'), list) else []
    if pagination.get('has_next_page') and pagination.get('next_cursor'):
        return voices, str(pagination.get('next_cursor'))
    return voices, ''



def find_vbee_voice_code(api_base_url, token_secret, app_id, requested_language_code):
    if not token_secret or not app_id:
        return ''
    public_voices_url = build_vbee_public_voices_url(api_base_url)
    normalized_requested_language = normalize_vbee_language_code(requested_language_code)
    next_cursor = ''
    seen_cursors = set()

    while True:
        voices, next_page_cursor = _load_public_voice_page(public_voices_url, token_secret, app_id, cursor=next_cursor)
        for voice in voices:
            if vbee_language_matches(voice.get('language_code'), normalized_requested_language):
                return str(voice.get('code') or '')
        if not next_page_cursor or next_page_cursor in seen_cursors:
            return ''
        seen_cursors.add(next_page_cursor)
        next_cursor = next_page_cursor
