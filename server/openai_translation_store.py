import json
import os
import time

try:
    from mysql_connection import connect_mysql, load_mysql_settings, quote_mysql_identifier, require_mysql_driver
    from openai_translation_record_utils import (
        row_to_request_record as _row_to_request_record,
        safe_bool as _safe_bool,
        safe_float as _safe_float,
        safe_int as _safe_int,
        scrub_openai_request_detail_row as _scrub_openai_request_detail_row_impl,
        serialize_config as _serialize_config_impl,
        serialize_token as _serialize_token,
    )
except ImportError:
    from .mysql_connection import connect_mysql, load_mysql_settings, quote_mysql_identifier, require_mysql_driver
    from .openai_translation_record_utils import (
        row_to_request_record as _row_to_request_record,
        safe_bool as _safe_bool,
        safe_float as _safe_float,
        safe_int as _safe_int,
        scrub_openai_request_detail_row as _scrub_openai_request_detail_row_impl,
        serialize_config as _serialize_config_impl,
        serialize_token as _serialize_token,
    )

try:
    from request_store import RequestStoreError, ensure_request_schema
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
    }


def _serialize_config(row):
    return _serialize_config_impl(row, defaults=_defaults(), legacy_default_model=LEGACY_DEFAULT_MODEL)


def _scrub_openai_request_detail_row(connection, row):
    return _scrub_openai_request_detail_row_impl(connection, row, request_type=OPENAI_REQUEST_TYPE, provider=OPENAI_REQUEST_PROVIDER)


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
        server_connection = _connect()
        try:
            with server_connection.cursor() as cursor:
                cursor.execute(
                    f'CREATE DATABASE IF NOT EXISTS {_quote_identifier(MYSQL_DATABASE)} '
                    'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
                )
        finally:
            server_connection.close()

        database_connection = _connect(MYSQL_DATABASE)
        try:
            with database_connection.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS openai_translation_tokens (
                        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(120) NOT NULL,
                        api_key TEXT NOT NULL,
                        is_active TINYINT(1) NOT NULL DEFAULT 1,
                        created_at DOUBLE NOT NULL,
                        updated_at DOUBLE NOT NULL,
                        last_used_at DOUBLE NOT NULL DEFAULT 0,
                        INDEX idx_openai_translation_tokens_active (is_active, updated_at),
                        INDEX idx_openai_translation_tokens_last_used (last_used_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS openai_translation_config (
                        id TINYINT NOT NULL PRIMARY KEY,
                        api_base_url VARCHAR(255) NOT NULL,
                        model VARCHAR(120) NOT NULL,
                        system_prompt LONGTEXT NULL,
                        prompt_template LONGTEXT NULL,
                        temperature DOUBLE NOT NULL DEFAULT 0.2,
                        timeout_seconds INT NOT NULL DEFAULT 120,
                        created_at DOUBLE NOT NULL,
                        updated_at DOUBLE NOT NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    """
                )
        finally:
            database_connection.close()
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to initialize OpenAI translation storage') from error

    _schema_ready = True


def list_openai_translation_tokens(include_secret=False):
    ensure_openai_translation_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM openai_translation_tokens ORDER BY updated_at DESC, id DESC')
                return [_serialize_token(row, include_secret=include_secret) for row in cursor.fetchall() or []]
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to list OpenAI tokens') from error


def get_openai_translation_token(token_id, include_secret=False):
    ensure_openai_translation_schema()
    driver = _require_driver()
    safe_token_id = _safe_int(token_id, 0)
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM openai_translation_tokens WHERE id = %s LIMIT 1', (safe_token_id,))
                token = _serialize_token(cursor.fetchone(), include_secret=include_secret)
                if not token:
                    raise OpenAiTranslationNotFoundError('OpenAI token not found')
                return token
        finally:
            connection.close()
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
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    'INSERT INTO openai_translation_tokens (name, api_key, is_active, created_at, updated_at, last_used_at) VALUES (%s, %s, %s, %s, %s, %s)',
                    (name, token, 1 if is_active else 0, now, now, 0),
                )
                token_id = int(cursor.lastrowid or 0)
        finally:
            connection.close()
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
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    'UPDATE openai_translation_tokens SET name = %s, api_key = %s, is_active = %s, updated_at = %s WHERE id = %s',
                    (name, token, 1 if is_active else 0, now, safe_token_id),
                )
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to update OpenAI token') from error
    return get_openai_translation_token(safe_token_id)


def delete_openai_translation_token(token_id):
    token = get_openai_translation_token(token_id)
    driver = _require_driver()
    safe_token_id = _safe_int(token_id, 0)
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('DELETE FROM openai_translation_tokens WHERE id = %s', (safe_token_id,))
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to delete OpenAI token') from error
    return token


def choose_openai_translation_token():
    ensure_openai_translation_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    'SELECT * FROM openai_translation_tokens WHERE is_active = 1 ORDER BY last_used_at ASC, updated_at DESC, id DESC LIMIT 1'
                )
                token = _serialize_token(cursor.fetchone(), include_secret=True)
                if not token:
                    raise OpenAiTranslationValidationError('No active OpenAI token is configured.')
                return token
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to load an active OpenAI token') from error


def touch_openai_translation_token(token_id, used_at=None):
    ensure_openai_translation_schema()
    driver = _require_driver()
    safe_token_id = _safe_int(token_id, 0)
    now = float(used_at or time.time())
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('UPDATE openai_translation_tokens SET last_used_at = %s, updated_at = %s WHERE id = %s', (now, now, safe_token_id))
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to update OpenAI token usage') from error
    return get_openai_translation_token(safe_token_id)


def get_openai_translation_config():
    ensure_openai_translation_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM openai_translation_config WHERE id = 1 LIMIT 1')
                return _serialize_config(cursor.fetchone())
        finally:
            connection.close()
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
    }
    now = time.time()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO openai_translation_config
                        (id, api_base_url, model, system_prompt, prompt_template, temperature, timeout_seconds, created_at, updated_at)
                    VALUES (1, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        api_base_url = VALUES(api_base_url),
                        model = VALUES(model),
                        system_prompt = VALUES(system_prompt),
                        prompt_template = VALUES(prompt_template),
                        temperature = VALUES(temperature),
                        timeout_seconds = VALUES(timeout_seconds),
                        updated_at = VALUES(updated_at)
                    """,
                    (
                        next_config['apiBaseUrl'],
                        next_config['model'],
                        next_config['systemPrompt'],
                        next_config['promptTemplate'],
                        next_config['temperature'],
                        next_config['timeoutSeconds'],
                        now,
                        now,
                    ),
                )
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to update OpenAI config') from error
    return get_openai_translation_config()


def list_openai_request_records_page(status='', page=1, page_size=20):
    ensure_openai_translation_schema()
    safe_page = max(1, _safe_int(page, 1))
    safe_page_size = max(1, min(100, _safe_int(page_size, 20)))
    safe_status = str(status or '').strip().lower()
    where_clauses = ['request_type = %s', 'provider = %s']
    query_params = [OPENAI_REQUEST_TYPE, OPENAI_REQUEST_PROVIDER]
    if safe_status:
        where_clauses.append('status = %s')
        query_params.append(safe_status)
    where_sql = ' AND '.join(where_clauses)

    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(f'SELECT COUNT(*) AS total_items FROM server_requests WHERE {where_sql}', tuple(query_params))
                total_items = int((cursor.fetchone() or {}).get('total_items') or 0)
                total_pages = max(1, (total_items + safe_page_size - 1) // safe_page_size)
                current_page = min(safe_page, total_pages)
                cursor.execute(
                    f'SELECT * FROM server_requests WHERE {where_sql} ORDER BY updated_at DESC, created_at DESC LIMIT %s OFFSET %s',
                    tuple(query_params + [safe_page_size, (current_page - 1) * safe_page_size]),
                )
                rows = cursor.fetchall() or []
                sanitized_records = []
                for row in rows:
                    if row:
                        try:
                            row['details_json'] = json.dumps(_scrub_openai_request_detail_row(connection, row), ensure_ascii=False, separators=(',', ':'))
                        except json.JSONDecodeError:
                            row['details_json'] = '{}'
                    sanitized_records.append(_row_to_request_record(row))
                return {
                    'requests': sanitized_records,
                    'pagination': {
                        'page': current_page,
                        'pageSize': safe_page_size,
                        'totalItems': total_items,
                        'totalPages': total_pages,
                        'hasNext': current_page < total_pages,
                        'hasPrevious': current_page > 1,
                    },
                }
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to list OpenAI requests') from error


def get_openai_request_record(request_id):
    ensure_openai_translation_schema()
    safe_request_id = str(request_id or '').strip()
    if not safe_request_id:
        raise OpenAiTranslationNotFoundError('OpenAI request not found')
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    'SELECT * FROM server_requests WHERE request_id = %s AND request_type = %s AND provider = %s LIMIT 1',
                    (safe_request_id, OPENAI_REQUEST_TYPE, OPENAI_REQUEST_PROVIDER),
                )
                row = cursor.fetchone()
                if row:
                    try:
                        row['details_json'] = json.dumps(_scrub_openai_request_detail_row(connection, row), ensure_ascii=False, separators=(',', ':'))
                    except json.JSONDecodeError:
                        row['details_json'] = '{}'
                record = _row_to_request_record(row)
                if not record:
                    raise OpenAiTranslationNotFoundError('OpenAI request not found')
                return record
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise OpenAiTranslationError('Unable to read OpenAI request') from error