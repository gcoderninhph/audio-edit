import json
import os
import time
from pathlib import Path

try:
    from utils.mysql_connection import connect_mysql, load_mysql_settings, quote_mysql_identifier, require_mysql_driver
    from utils.pagination import build_pagination, normalize_pagination
    from repositories.request_repository import (
        count_user_request_records,
        ensure_request_tables,
        get_request_record_row,
        get_translation_job_row,
        insert_translation_job_if_missing,
        list_recent_request_record_rows,
        list_user_request_record_rows,
        upsert_request_record,
        upsert_translation_job,
    )
except ImportError:
    from ..utils.mysql_connection import connect_mysql, load_mysql_settings, quote_mysql_identifier, require_mysql_driver
    from ..utils.pagination import build_pagination, normalize_pagination
    from ..repositories.request_repository import (
        count_user_request_records,
        ensure_request_tables,
        get_request_record_row,
        get_translation_job_row,
        insert_translation_job_if_missing,
        list_recent_request_record_rows,
        list_user_request_record_rows,
        upsert_request_record,
        upsert_translation_job,
    )

_MYSQL_SETTINGS = load_mysql_settings(['REQUEST', 'AUTH'])
MYSQL_HOST = _MYSQL_SETTINGS['host']
MYSQL_PORT = _MYSQL_SETTINGS['port']
MYSQL_USER = _MYSQL_SETTINGS['user']
MYSQL_PASSWORD = _MYSQL_SETTINGS['password']
MYSQL_DATABASE = _MYSQL_SETTINGS['database']
LEGACY_TRANSLATION_ROOT = Path(__file__).resolve().parent / 'uploads' / 'translation-jobs'

_schema_ready = False


class RequestStoreError(RuntimeError):
    pass


def _require_driver():
    return require_mysql_driver(RequestStoreError)


def _quote_identifier(identifier):
    return quote_mysql_identifier(identifier, RequestStoreError)


def _connect(database=None):
    return connect_mysql(_MYSQL_SETTINGS, error_cls=RequestStoreError, database=database)


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


def _migrate_legacy_translation_jobs():
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
        insert_translation_job_if_missing(
            {
                'job_id': job_id,
                'user_id': 'legacy-user',
                'status': metadata.get('status') or 'failed',
                'error': metadata.get('error'),
                'target_language': metadata.get('target_language') or '',
                'output_file_name': metadata.get('output_file_name') or 'translated.srt',
                'output_content': _read_legacy_output(metadata),
                'created_at': float(metadata.get('created_at') or 0),
                'updated_at': float(metadata.get('updated_at') or 0),
            }
        )


def ensure_request_schema():
    global _schema_ready
    if _schema_ready:
        return

    driver = _require_driver()
    try:
        ensure_request_tables()
        _migrate_legacy_translation_jobs()
    except driver.MySQLError as error:
        raise RequestStoreError('Unable to initialize request database schema') from error

    _schema_ready = True


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
        upsert_translation_job(job)
    except driver.MySQLError as error:
        raise RequestStoreError('Unable to save translation request') from error


def get_translation_job(job_id):
    ensure_request_schema()
    driver = _require_driver()
    try:
        return _row_to_translation_job(get_translation_job_row(job_id))
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
        upsert_request_record(
            {
                'request_id': record['request_id'],
                'user_id': record['user_id'],
                'request_type': record['request_type'],
                'provider': record['provider'],
                'status': record.get('status') or 'running',
                'source_file_name': record.get('source_file_name'),
                'target_language': record.get('target_language'),
                'output_file_name': record.get('output_file_name'),
                'details_json': details_json,
                'created_at': created_at,
                'updated_at': updated_at,
            }
        )
    except driver.MySQLError as error:
        raise RequestStoreError('Unable to save server request') from error


def get_request_record(request_id):
    ensure_request_schema()
    driver = _require_driver()
    try:
        return _row_to_request_record(get_request_record_row(request_id))
    except driver.MySQLError as error:
        raise RequestStoreError('Unable to read server request') from error


def list_recent_request_records(limit=50):
    ensure_request_schema()
    driver = _require_driver()
    safe_limit = max(1, min(200, int(limit or 50)))
    try:
        return [_row_to_request_record(row) for row in list_recent_request_record_rows(safe_limit)]
    except driver.MySQLError as error:
        raise RequestStoreError('Unable to list server requests') from error


def list_user_request_records_page(user_id, page=1, page_size=10):
    ensure_request_schema()
    driver = _require_driver()
    safe_page, safe_page_size = normalize_pagination(page, page_size, default_page_size=10, max_page_size=100)
    try:
        total_items = count_user_request_records(user_id)
        pagination = build_pagination(safe_page, safe_page_size, total_items)
        current_page = pagination['page']
        rows = list_user_request_record_rows(
            user_id,
            safe_page_size,
            (current_page - 1) * safe_page_size,
        )
        return {
            'requests': [_row_to_request_record(row) for row in rows],
            'pagination': pagination,
        }
    except driver.MySQLError as error:
        raise RequestStoreError('Unable to list user server requests') from error