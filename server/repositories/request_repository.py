try:
    from utils.mysql_connection import connect_mysql, load_mysql_settings, quote_mysql_identifier, require_mysql_driver
except ImportError:
    from ..utils.mysql_connection import connect_mysql, load_mysql_settings, quote_mysql_identifier, require_mysql_driver


class RequestRepositoryError(RuntimeError):
    pass


_MYSQL_SETTINGS = load_mysql_settings(['REQUEST', 'AUTH'])
MYSQL_DATABASE = _MYSQL_SETTINGS['database']


def _require_driver():
    return require_mysql_driver(RequestRepositoryError)


def _quote_identifier(identifier):
    return quote_mysql_identifier(identifier, RequestRepositoryError)


def _connect(database=None):
    return connect_mysql(_MYSQL_SETTINGS, error_cls=RequestRepositoryError, database=database)


def _ensure_column(cursor, table_name, column_name, definition):
    cursor.execute(
        """
        SELECT COUNT(*) AS column_count
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s AND column_name = %s
        """,
        (MYSQL_DATABASE, table_name, column_name),
    )
    row = cursor.fetchone() or {}
    if int(row.get('column_count') or 0) == 0:
        cursor.execute(f'ALTER TABLE `{table_name}` ADD COLUMN `{column_name}` {definition}')


def ensure_request_tables(migrate_legacy_callback=None):
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
                CREATE TABLE IF NOT EXISTS request_translation_jobs (
                    job_id VARCHAR(128) NOT NULL PRIMARY KEY,
                    user_id VARCHAR(80) NOT NULL,
                    status VARCHAR(32) NOT NULL,
                    error TEXT NULL,
                    target_language VARCHAR(32) NOT NULL,
                    output_file_name VARCHAR(255) NOT NULL,
                    output_content LONGTEXT NULL,
                    created_at DOUBLE NOT NULL,
                    updated_at DOUBLE NOT NULL,
                    INDEX idx_request_translation_status (status),
                    INDEX idx_request_translation_user (user_id),
                    INDEX idx_request_translation_updated (updated_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            _ensure_column(
                cursor,
                'request_translation_jobs',
                'user_id',
                "VARCHAR(80) NOT NULL DEFAULT 'legacy-user' AFTER job_id",
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS server_requests (
                    request_id VARCHAR(128) NOT NULL PRIMARY KEY,
                    user_id VARCHAR(80) NOT NULL,
                    request_type VARCHAR(40) NOT NULL,
                    provider VARCHAR(80) NOT NULL,
                    status VARCHAR(40) NOT NULL,
                    source_file_name VARCHAR(255) NULL,
                    target_language VARCHAR(32) NULL,
                    output_file_name VARCHAR(255) NULL,
                    details_json LONGTEXT NULL,
                    created_at DOUBLE NOT NULL,
                    updated_at DOUBLE NOT NULL,
                    INDEX idx_server_requests_user_type (user_id, request_type),
                    INDEX idx_server_requests_updated (updated_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            if callable(migrate_legacy_callback):
                migrate_legacy_callback(cursor)
    finally:
        database_connection.close()


def upsert_translation_job(job):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO request_translation_jobs
                    (job_id, user_id, status, error, target_language, output_file_name, output_content, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    user_id = VALUES(user_id),
                    status = VALUES(status),
                    error = VALUES(error),
                    target_language = VALUES(target_language),
                    output_file_name = VALUES(output_file_name),
                    output_content = VALUES(output_content),
                    updated_at = VALUES(updated_at)
                """,
                (
                    job['job_id'],
                    job.get('user_id') or 'legacy-user',
                    job['status'],
                    job.get('error'),
                    job['target_language'],
                    job['output_file_name'],
                    job.get('output_content'),
                    float(job['created_at']),
                    float(job['updated_at']),
                ),
            )
    finally:
        connection.close()


def insert_translation_job_if_missing(job):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT IGNORE INTO request_translation_jobs
                    (job_id, user_id, status, error, target_language, output_file_name, output_content, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    job['job_id'],
                    job.get('user_id') or 'legacy-user',
                    job.get('status') or 'failed',
                    job.get('error'),
                    job.get('target_language') or '',
                    job.get('output_file_name') or 'translated.srt',
                    job.get('output_content'),
                    float(job.get('created_at') or 0),
                    float(job.get('updated_at') or 0),
                ),
            )
    finally:
        connection.close()


def get_translation_job_row(job_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM request_translation_jobs WHERE job_id = %s LIMIT 1', (job_id,))
            return cursor.fetchone()
    finally:
        connection.close()


def upsert_request_record(record):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO server_requests
                    (request_id, user_id, request_type, provider, status, source_file_name,
                     target_language, output_file_name, details_json, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    user_id = VALUES(user_id),
                    request_type = VALUES(request_type),
                    provider = VALUES(provider),
                    status = VALUES(status),
                    source_file_name = VALUES(source_file_name),
                    target_language = VALUES(target_language),
                    output_file_name = VALUES(output_file_name),
                    details_json = VALUES(details_json),
                    updated_at = VALUES(updated_at)
                """,
                (
                    record['request_id'],
                    record['user_id'],
                    record['request_type'],
                    record['provider'],
                    record.get('status') or 'running',
                    record.get('source_file_name'),
                    record.get('target_language'),
                    record.get('output_file_name'),
                    record.get('details_json'),
                    float(record['created_at']),
                    float(record['updated_at']),
                ),
            )
    finally:
        connection.close()


def get_request_record_row(request_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM server_requests WHERE request_id = %s LIMIT 1', (request_id,))
            return cursor.fetchone()
    finally:
        connection.close()


def list_recent_request_record_rows(limit=50):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM server_requests ORDER BY updated_at DESC LIMIT %s', (int(limit),))
            return cursor.fetchall() or []
    finally:
        connection.close()


def count_user_request_records(user_id):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT COUNT(*) AS total_items FROM server_requests WHERE user_id = %s', (user_id,))
            return int((cursor.fetchone() or {}).get('total_items') or 0)
    finally:
        connection.close()


def list_user_request_record_rows(user_id, page_size, offset):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT *
                FROM server_requests
                WHERE user_id = %s
                ORDER BY updated_at DESC, created_at DESC
                LIMIT %s OFFSET %s
                """,
                (user_id, int(page_size), int(offset)),
            )
            return cursor.fetchall() or []
    finally:
        connection.close()