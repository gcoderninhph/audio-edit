try:
    from utils.mysql_connection import connect_mysql, load_mysql_settings, quote_mysql_identifier, require_mysql_driver
except ImportError:
    from ..utils.mysql_connection import connect_mysql, load_mysql_settings, quote_mysql_identifier, require_mysql_driver


class OpenAiTranslationRepositoryError(RuntimeError):
    pass


_MYSQL_SETTINGS = load_mysql_settings(['OPENAI', 'REQUEST', 'AUTH'])
MYSQL_DATABASE = _MYSQL_SETTINGS['database']


def _require_driver():
    return require_mysql_driver(OpenAiTranslationRepositoryError)


def _quote_identifier(identifier):
    return quote_mysql_identifier(identifier, OpenAiTranslationRepositoryError)


def _connect(database=None):
    return connect_mysql(_MYSQL_SETTINGS, error_cls=OpenAiTranslationRepositoryError, database=database)


def ensure_openai_translation_tables():
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
                    credit_per_word DOUBLE NOT NULL DEFAULT 1,
                    created_at DOUBLE NOT NULL,
                    updated_at DOUBLE NOT NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cursor.execute(
                """
                SELECT COUNT(*) AS column_count
                FROM information_schema.columns
                WHERE table_schema = %s AND table_name = %s AND column_name = %s
                """,
                (MYSQL_DATABASE, 'openai_translation_config', 'credit_per_word'),
            )
            row = cursor.fetchone() or {}
            if int(row.get('column_count') or 0) == 0:
                cursor.execute('ALTER TABLE openai_translation_config ADD COLUMN credit_per_word DOUBLE NOT NULL DEFAULT 1 AFTER timeout_seconds')
    finally:
        database_connection.close()


def list_openai_translation_token_rows():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM openai_translation_tokens ORDER BY updated_at DESC, id DESC')
            return cursor.fetchall() or []
    finally:
        connection.close()


def get_openai_translation_token_row(token_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM openai_translation_tokens WHERE id = %s LIMIT 1', (int(token_id),))
            return cursor.fetchone()
    finally:
        connection.close()


def insert_openai_translation_token_row(name, api_key, is_active, created_at):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'INSERT INTO openai_translation_tokens (name, api_key, is_active, created_at, updated_at, last_used_at) VALUES (%s, %s, %s, %s, %s, %s)',
                (name, api_key, int(is_active), float(created_at), float(created_at), 0),
            )
            return int(cursor.lastrowid or 0)
    finally:
        connection.close()


def update_openai_translation_token_row(token_id, name, api_key, is_active, updated_at):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'UPDATE openai_translation_tokens SET name = %s, api_key = %s, is_active = %s, updated_at = %s WHERE id = %s',
                (name, api_key, int(is_active), float(updated_at), int(token_id)),
            )
    finally:
        connection.close()


def delete_openai_translation_token_row(token_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM openai_translation_tokens WHERE id = %s', (int(token_id),))
    finally:
        connection.close()


def get_active_openai_translation_token_row():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT * FROM openai_translation_tokens WHERE is_active = 1 ORDER BY last_used_at ASC, updated_at DESC, id DESC LIMIT 1'
            )
            return cursor.fetchone()
    finally:
        connection.close()


def touch_openai_translation_token_row(token_id, used_at):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'UPDATE openai_translation_tokens SET last_used_at = %s, updated_at = %s WHERE id = %s',
                (float(used_at), float(used_at), int(token_id)),
            )
    finally:
        connection.close()


def get_openai_translation_config_row():
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM openai_translation_config WHERE id = 1 LIMIT 1')
            return cursor.fetchone()
    finally:
        connection.close()


def upsert_openai_translation_config_row(config_row, updated_at):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO openai_translation_config
                    (id, api_base_url, model, system_prompt, prompt_template, temperature, timeout_seconds, credit_per_word, created_at, updated_at)
                VALUES (1, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    api_base_url = VALUES(api_base_url),
                    model = VALUES(model),
                    system_prompt = VALUES(system_prompt),
                    prompt_template = VALUES(prompt_template),
                    temperature = VALUES(temperature),
                    timeout_seconds = VALUES(timeout_seconds),
                    credit_per_word = VALUES(credit_per_word),
                    updated_at = VALUES(updated_at)
                """,
                (
                    config_row['apiBaseUrl'],
                    config_row['model'],
                    config_row['systemPrompt'],
                    config_row['promptTemplate'],
                    config_row['temperature'],
                    config_row['timeoutSeconds'],
                    config_row['creditPerWord'],
                    float(updated_at),
                    float(updated_at),
                ),
            )
    finally:
        connection.close()


def count_openai_request_rows(request_type, provider, status=''):
    where_clauses = ['request_type = %s', 'provider = %s']
    params = [request_type, provider]
    safe_status = str(status or '').strip().lower()
    if safe_status:
        where_clauses.append('status = %s')
        params.append(safe_status)
    where_sql = ' AND '.join(where_clauses)

    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(f'SELECT COUNT(*) AS total_items FROM server_requests WHERE {where_sql}', tuple(params))
            return int((cursor.fetchone() or {}).get('total_items') or 0)
    finally:
        connection.close()


def list_openai_request_rows(request_type, provider, status='', limit=20, offset=0):
    where_clauses = ['request_type = %s', 'provider = %s']
    params = [request_type, provider]
    safe_status = str(status or '').strip().lower()
    if safe_status:
        where_clauses.append('status = %s')
        params.append(safe_status)
    where_sql = ' AND '.join(where_clauses)

    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f'SELECT * FROM server_requests WHERE {where_sql} ORDER BY updated_at DESC, created_at DESC LIMIT %s OFFSET %s',
                tuple(params + [int(limit), int(offset)]),
            )
            return cursor.fetchall() or []
    finally:
        connection.close()


def get_openai_request_row(request_id, request_type, provider):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT * FROM server_requests WHERE request_id = %s AND request_type = %s AND provider = %s LIMIT 1',
                (request_id, request_type, provider),
            )
            return cursor.fetchone()
    finally:
        connection.close()


def update_openai_request_details_json(request_id, request_type, provider, details_json):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'UPDATE server_requests SET details_json = %s WHERE request_id = %s AND request_type = %s AND provider = %s',
                (details_json, request_id, request_type, provider),
            )
    finally:
        connection.close()