import json
import os
import time
from pathlib import Path

try:
    import pymysql
except ImportError as import_error:
    pymysql = None
    PYMYSQL_IMPORT_ERROR = import_error
else:
    PYMYSQL_IMPORT_ERROR = None


MYSQL_HOST = os.environ.get('REQUEST_MYSQL_HOST') or os.environ.get('AUTH_MYSQL_HOST') or os.environ.get('MYSQL_HOST', 'localhost')
MYSQL_PORT = int(os.environ.get('REQUEST_MYSQL_PORT') or os.environ.get('AUTH_MYSQL_PORT') or os.environ.get('MYSQL_PORT', '3306'))
MYSQL_USER = os.environ.get('REQUEST_MYSQL_USER') or os.environ.get('AUTH_MYSQL_USER') or os.environ.get('MYSQL_USER', 'root')
MYSQL_PASSWORD = os.environ.get('REQUEST_MYSQL_PASSWORD') or os.environ.get('AUTH_MYSQL_PASSWORD') or os.environ.get('MYSQL_PASSWORD', '12345678')
MYSQL_DATABASE = os.environ.get('REQUEST_MYSQL_DATABASE') or os.environ.get('AUTH_MYSQL_DATABASE') or os.environ.get('MYSQL_DATABASE', 'audio_studio')
LEGACY_TRANSLATION_ROOT = Path(__file__).resolve().parent / 'uploads' / 'translation-jobs'

_schema_ready = False


class RequestStoreError(RuntimeError):
    pass


def _require_driver():
    if pymysql is None:
        raise RequestStoreError('PyMySQL is not installed') from PYMYSQL_IMPORT_ERROR
    return pymysql


def _quote_identifier(identifier):
    safe_identifier = ''.join(ch for ch in str(identifier or '') if ch.isalnum() or ch == '_')
    if not safe_identifier:
        raise RequestStoreError('Invalid MySQL database name')
    return f'`{safe_identifier}`'


def _connect(database=None):
    driver = _require_driver()
    try:
        return driver.connect(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=database,
            charset='utf8mb4',
            cursorclass=driver.cursors.DictCursor,
            autocommit=True,
        )
    except driver.MySQLError as error:
        raise RequestStoreError('Unable to connect to MySQL') from error


def _read_legacy_output(metadata):
    output_path = metadata.get('output_path')
    if not output_path:
        return None

    try:
        path = Path(output_path)
        if path.exists() and path.is_file():
            return path.read_text(encoding='utf-8')
    except OSError:
        return None

    return None


def _migrate_legacy_translation_jobs(cursor):
    if not LEGACY_TRANSLATION_ROOT.exists():
        return

    for metadata_path in LEGACY_TRANSLATION_ROOT.glob('local-translation-*.json'):
        try:
            metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            continue

        job_id = str(metadata.get('job_id') or '').strip()
        if not job_id:
            continue

        cursor.execute(
            """
            INSERT IGNORE INTO request_translation_jobs
                (job_id, user_id, status, error, target_language, output_file_name, output_content, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                job_id,
                'legacy-user',
                metadata.get('status') or 'failed',
                metadata.get('error'),
                metadata.get('target_language') or '',
                metadata.get('output_file_name') or 'translated.srt',
                _read_legacy_output(metadata),
                float(metadata.get('created_at') or 0),
                float(metadata.get('updated_at') or 0),
            ),
        )


def ensure_request_schema():
    global _schema_ready
    if _schema_ready:
        return

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
                _migrate_legacy_translation_jobs(cursor)
        finally:
            database_connection.close()
    except driver.MySQLError as error:
        raise RequestStoreError('Unable to initialize request database schema') from error

    _schema_ready = True


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


def _row_to_translation_job(row):
    if not row:
        return None
    return {
        'job_id': row['job_id'],
        'user_id': row.get('user_id') or 'legacy-user',
        'status': row.get('status') or 'failed',
        'error': row.get('error'),
        'target_language': row.get('target_language') or '',
        'output_file_name': row.get('output_file_name') or 'translated.srt',
        'output_content': row.get('output_content'),
        'created_at': float(row.get('created_at') or 0),
        'updated_at': float(row.get('updated_at') or 0),
    }


def save_translation_job(job):
    ensure_request_schema()
    driver = _require_driver()
    try:
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
    except driver.MySQLError as error:
        raise RequestStoreError('Unable to save translation request') from error


def get_translation_job(job_id):
    ensure_request_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM request_translation_jobs WHERE job_id = %s LIMIT 1', (job_id,))
                return _row_to_translation_job(cursor.fetchone())
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise RequestStoreError('Unable to read translation request') from error


def _row_to_request_record(row):
    if not row:
        return None
    details_json = row.get('details_json')
    try:
        details = json.loads(details_json) if details_json else {}
    except json.JSONDecodeError:
        details = {}

    return {
        'request_id': row['request_id'],
        'user_id': row['user_id'],
        'request_type': row.get('request_type') or '',
        'provider': row.get('provider') or '',
        'status': row.get('status') or '',
        'source_file_name': row.get('source_file_name'),
        'target_language': row.get('target_language'),
        'output_file_name': row.get('output_file_name'),
        'details': details,
        'created_at': float(row.get('created_at') or 0),
        'updated_at': float(row.get('updated_at') or 0),
    }


def save_request_record(record):
    ensure_request_schema()
    driver = _require_driver()
    details_json = json.dumps(record.get('details') or {}, ensure_ascii=False, separators=(',', ':'))
    created_at = float(record.get('created_at') or record.get('updated_at') or time.time())
    updated_at = float(record.get('updated_at') or created_at)
    try:
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
                        details_json,
                        created_at,
                        updated_at,
                    ),
                )
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise RequestStoreError('Unable to save server request') from error


def get_request_record(request_id):
    ensure_request_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM server_requests WHERE request_id = %s LIMIT 1', (request_id,))
                return _row_to_request_record(cursor.fetchone())
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise RequestStoreError('Unable to read server request') from error


def list_recent_request_records(limit=50):
    ensure_request_schema()
    driver = _require_driver()
    safe_limit = max(1, min(200, int(limit or 50)))
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT * FROM server_requests ORDER BY updated_at DESC LIMIT %s', (safe_limit,))
                return [_row_to_request_record(row) for row in cursor.fetchall() or []]
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise RequestStoreError('Unable to list server requests') from error


def list_user_request_records_page(user_id, page=1, page_size=10):
    ensure_request_schema()
    driver = _require_driver()
    safe_page = max(1, int(page or 1))
    safe_page_size = max(1, min(100, int(page_size or 10)))
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT COUNT(*) AS total_items FROM server_requests WHERE user_id = %s', (user_id,))
                total_items = int((cursor.fetchone() or {}).get('total_items') or 0)
                total_pages = max(1, (total_items + safe_page_size - 1) // safe_page_size)
                current_page = min(safe_page, total_pages)
                cursor.execute(
                    """
                    SELECT *
                    FROM server_requests
                    WHERE user_id = %s
                    ORDER BY updated_at DESC, created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (user_id, safe_page_size, (current_page - 1) * safe_page_size),
                )
                return {
                    'requests': [_row_to_request_record(row) for row in cursor.fetchall() or []],
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
        raise RequestStoreError('Unable to list user server requests') from error