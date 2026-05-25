import json
import os
import time

try:
    from utils.mysql_connection import connect_mysql, load_mysql_settings, quote_mysql_identifier, require_mysql_driver
    from utils.pagination import build_pagination, normalize_pagination
    from repositories.openai_translation_repository import (
        count_openai_request_rows,
        delete_openai_translation_token_row,
        ensure_openai_translation_tables,
        get_active_openai_translation_token_row,
        get_openai_request_row,
        get_openai_translation_config_row,
        get_openai_translation_token_row,
        insert_openai_translation_token_row,
        list_openai_request_rows,
        list_openai_translation_token_rows,
        touch_openai_translation_token_row,
        update_openai_request_details_json,
        update_openai_translation_token_row,
        upsert_openai_translation_config_row,
    )
    from utils.openai_translation_record_utils import (
        row_to_request_record as _row_to_request_record,
        sanitize_openai_request_details as _sanitize_openai_request_details,
        safe_bool as _safe_bool,
        safe_float as _safe_float,
        safe_int as _safe_int,
        serialize_config as _serialize_config_impl,
        serialize_token as _serialize_token,
    )
except ImportError:
    from ..utils.mysql_connection import connect_mysql, load_mysql_settings, quote_mysql_identifier, require_mysql_driver
    from ..utils.pagination import build_pagination, normalize_pagination
    from ..repositories.openai_translation_repository import (
        count_openai_request_rows,
        delete_openai_translation_token_row,
        ensure_openai_translation_tables,
        get_active_openai_translation_token_row,
        get_openai_request_row,
        get_openai_translation_config_row,
        get_openai_translation_token_row,
        insert_openai_translation_token_row,
        list_openai_request_rows,
        list_openai_translation_token_rows,
        touch_openai_translation_token_row,
        update_openai_request_details_json,
        update_openai_translation_token_row,
        upsert_openai_translation_config_row,
    )
    from ..utils.openai_translation_record_utils import (
        row_to_request_record as _row_to_request_record,
        sanitize_openai_request_details as _sanitize_openai_request_details,
        safe_bool as _safe_bool,
        safe_float as _safe_float,
        safe_int as _safe_int,
        serialize_config as _serialize_config_impl,
        serialize_token as _serialize_token,
    )

try:
    from services.request_store import RequestStoreError, ensure_request_schema
except ImportError:
    from .request_store import RequestStoreError, ensure_request_schema

_MYSQL_SETTINGS = load_mysql_settings(['OPENAI', 'REQUEST', 'AUTH'])
MYSQL_HOST = _MYSQL_SETTINGS['host']
MYSQL_PORT = _MYSQL_SETTINGS['port']
MYSQL_USER = _MYSQL_SETTINGS['user']
MYSQL_PASSWORD = _MYSQL_SETTINGS['password']
MYSQL_DATABASE = _MYSQL_SETTINGS['database']

OPENAI_REQUEST_PROVIDER = 'openai-chatgpt'
OPENAI_REQUEST_TYPE = 'translation'
DEFAULT_API_BASE_URL = os.environ.get('OPENAI_TRANSLATION_API_BASE_URL', 'https://api.openai.com/v1')
LEGACY_DEFAULT_MODEL = 'gpt-4.1-mini'
DEFAULT_MODEL = os.environ.get('OPENAI_TRANSLATION_MODEL', 'gpt-5.4-mini')
DEFAULT_SYSTEM_PROMPT = os.environ.get(
    'OPENAI_TRANSLATION_SYSTEM_PROMPT',
    'You translate subtitle files. Return only valid SRT content. Keep subtitle order, numbering, and timestamps stable.',
)
DEFAULT_PROMPT_TEMPLATE = os.environ.get(
    'OPENAI_TRANSLATION_PROMPT_TEMPLATE',
    'Translate this subtitle file into <TARGET_LANGUAGE>. Keep each subtitle block aligned with the original structure and return only valid SRT content.\n\n<SRT_FILE_CONTENT>',
)
DEFAULT_TEMPERATURE = float(os.environ.get('OPENAI_TRANSLATION_TEMPERATURE', '0.2'))
DEFAULT_TIMEOUT_SECONDS = int(os.environ.get('OPENAI_TRANSLATION_TIMEOUT_SECONDS', '120'))
DEFAULT_CREDIT_PER_WORD = float(os.environ.get('OPENAI_TRANSLATION_CREDIT_PER_WORD', '1') or '1')

_schema_ready = False

class OpenAiTranslationError(RuntimeError):
    pass

class OpenAiTranslationNotFoundError(OpenAiTranslationError):
    pass
class OpenAiTranslationValidationError(OpenAiTranslationError):
    pass
def _require_driver():
    return require_mysql_driver(OpenAiTranslationError)


def _quote_identifier(identifier):
    return quote_mysql_identifier(identifier, OpenAiTranslationError)


def _connect(database=None):
    return connect_mysql(_MYSQL_SETTINGS, error_cls=OpenAiTranslationError, database=database)


def _defaults():
    return {
        'apiBaseUrl': DEFAULT_API_BASE_URL,
        'model': DEFAULT_MODEL,
        'systemPrompt': DEFAULT_SYSTEM_PROMPT,
        'promptTemplate': DEFAULT_PROMPT_TEMPLATE,
        'temperature': DEFAULT_TEMPERATURE,
        'timeoutSeconds': DEFAULT_TIMEOUT_SECONDS,
        'creditPerWord': DEFAULT_CREDIT_PER_WORD,
    }


def _serialize_config(row):
    return _serialize_config_impl(row, defaults=_defaults(), legacy_default_model=LEGACY_DEFAULT_MODEL)


def ensure_openai_translation_schema():
    global _schema_ready
    if _schema_ready:
        return

    try:
        ensure_request_schema()
    except RequestStoreError as error:
        raise OpenAiTranslationError('Unable to initialize request storage') from error

    driver = _require_driver()
    try:
        ensure_openai_translation_tables()
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to initialize OpenAI translation storage') from error

    _schema_ready = True


def list_openai_translation_tokens(include_secret=False):
    ensure_openai_translation_schema()
    driver = _require_driver()
    try:
        return [_serialize_token(row, include_secret=include_secret) for row in list_openai_translation_token_rows()]
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to list OpenAI tokens') from error


def get_openai_translation_token(token_id, include_secret=False):
    ensure_openai_translation_schema()
    driver = _require_driver()
    safe_token_id = _safe_int(token_id, 0)
    try:
        token = _serialize_token(get_openai_translation_token_row(safe_token_id), include_secret=include_secret)
        if not token:
            raise OpenAiTranslationNotFoundError('OpenAI token not found')
        return token
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to read OpenAI token') from error


def create_openai_translation_token(payload):
    ensure_openai_translation_schema()
    name = str((payload or {}).get('name') or '').strip()
    token = str((payload or {}).get('token') or '').strip()
    if not name:
        raise OpenAiTranslationValidationError('Token name is required.')
    if not token:
        raise OpenAiTranslationValidationError('API token is required.')
    is_active = _safe_bool((payload or {}).get('isActive'), True)
    now = time.time()
    driver = _require_driver()
    try:
        token_id = insert_openai_translation_token_row(name, token, 1 if is_active else 0, now)
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to create OpenAI token') from error
    return get_openai_translation_token(token_id)


def update_openai_translation_token(token_id, payload):
    current_token = get_openai_translation_token(token_id, include_secret=True)
    name = str((payload or {}).get('name') or current_token['name']).strip()
    token = str((payload or {}).get('token') or current_token['token']).strip()
    if not name:
        raise OpenAiTranslationValidationError('Token name is required.')
    if not token:
        raise OpenAiTranslationValidationError('API token is required.')
    is_active = _safe_bool((payload or {}).get('isActive'), current_token['isActive'])
    now = time.time()
    driver = _require_driver()
    safe_token_id = _safe_int(token_id, 0)
    try:
        update_openai_translation_token_row(safe_token_id, name, token, 1 if is_active else 0, now)
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to update OpenAI token') from error
    return get_openai_translation_token(safe_token_id)


def delete_openai_translation_token(token_id):
    token = get_openai_translation_token(token_id)
    driver = _require_driver()
    safe_token_id = _safe_int(token_id, 0)
    try:
        delete_openai_translation_token_row(safe_token_id)
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to delete OpenAI token') from error
    return token


def choose_openai_translation_token():
    ensure_openai_translation_schema()
    driver = _require_driver()
    try:
        token = _serialize_token(get_active_openai_translation_token_row(), include_secret=True)
        if not token:
            raise OpenAiTranslationValidationError('No active OpenAI token is configured.')
        return token
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to load an active OpenAI token') from error


def touch_openai_translation_token(token_id, used_at=None):
    ensure_openai_translation_schema()
    driver = _require_driver()
    safe_token_id = _safe_int(token_id, 0)
    now = float(used_at or time.time())
    try:
        touch_openai_translation_token_row(safe_token_id, now)
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to update OpenAI token usage') from error
    return get_openai_translation_token(safe_token_id)


def get_openai_translation_config():
    ensure_openai_translation_schema()
    driver = _require_driver()
    try:
        return _serialize_config(get_openai_translation_config_row())
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to load OpenAI config') from error


def update_openai_translation_config(payload):
    ensure_openai_translation_schema()
    current_config = get_openai_translation_config()
    next_config = {
        'apiBaseUrl': str((payload or {}).get('apiBaseUrl') or current_config['apiBaseUrl']).strip() or DEFAULT_API_BASE_URL,
        'model': str((payload or {}).get('model') or current_config['model']).strip() or DEFAULT_MODEL,
        'systemPrompt': str((payload or {}).get('systemPrompt') or current_config['systemPrompt']).strip() or DEFAULT_SYSTEM_PROMPT,
        'promptTemplate': str((payload or {}).get('promptTemplate') or current_config['promptTemplate']).strip() or DEFAULT_PROMPT_TEMPLATE,
        'temperature': max(0.0, min(2.0, _safe_float((payload or {}).get('temperature'), current_config['temperature']))),
        'timeoutSeconds': max(10, min(600, _safe_int((payload or {}).get('timeoutSeconds'), current_config['timeoutSeconds']))),
        'creditPerWord': max(0.0, min(100000.0, _safe_float((payload or {}).get('creditPerWord'), current_config['creditPerWord']))),
    }
    now = time.time()
    driver = _require_driver()
    try:
        upsert_openai_translation_config_row(next_config, now)
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to update OpenAI config') from error
    return get_openai_translation_config()


def list_openai_request_records_page(status='', page=1, page_size=20):
    ensure_openai_translation_schema()
    safe_page, safe_page_size = normalize_pagination(page, page_size, default_page_size=20, max_page_size=100)
    safe_status = str(status or '').strip().lower()
    driver = _require_driver()
    try:
        total_items = count_openai_request_rows(OPENAI_REQUEST_TYPE, OPENAI_REQUEST_PROVIDER, status=safe_status)
        pagination = build_pagination(safe_page, safe_page_size, total_items)
        current_page = pagination['page']
        rows = list_openai_request_rows(
            OPENAI_REQUEST_TYPE,
            OPENAI_REQUEST_PROVIDER,
            status=safe_status,
            limit=safe_page_size,
            offset=(current_page - 1) * safe_page_size,
        )
        sanitized_records = []
        for row in rows:
            if row:
                try:
                    details = json.loads(row.get('details_json') or '{}') if str(row.get('details_json') or '').strip() else {}
                except json.JSONDecodeError:
                    details = {}
                safe_details, removed = _sanitize_openai_request_details(details)
                row['details_json'] = json.dumps(safe_details, ensure_ascii=False, separators=(',', ':'))
                if removed:
                    update_openai_request_details_json(
                        row.get('request_id') or '',
                        OPENAI_REQUEST_TYPE,
                        OPENAI_REQUEST_PROVIDER,
                        row['details_json'],
                    )
            sanitized_records.append(_row_to_request_record(row))
        return {
            'requests': sanitized_records,
            'pagination': pagination,
        }
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to list OpenAI requests') from error


def get_openai_request_record(request_id):
    ensure_openai_translation_schema()
    safe_request_id = str(request_id or '').strip()
    if not safe_request_id:
        raise OpenAiTranslationNotFoundError('OpenAI request not found')
    driver = _require_driver()
    try:
        row = get_openai_request_row(safe_request_id, OPENAI_REQUEST_TYPE, OPENAI_REQUEST_PROVIDER)
        if row:
            try:
                details = json.loads(row.get('details_json') or '{}') if str(row.get('details_json') or '').strip() else {}
            except json.JSONDecodeError:
                details = {}
            safe_details, removed = _sanitize_openai_request_details(details)
            row['details_json'] = json.dumps(safe_details, ensure_ascii=False, separators=(',', ':'))
            if removed:
                update_openai_request_details_json(
                    row.get('request_id') or '',
                    OPENAI_REQUEST_TYPE,
                    OPENAI_REQUEST_PROVIDER,
                    row['details_json'],
                )
        record = _row_to_request_record(row)
        if not record:
            raise OpenAiTranslationNotFoundError('OpenAI request not found')
        return record
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to read OpenAI request') from error