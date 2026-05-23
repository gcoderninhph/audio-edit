import base64
import json
import logging
import os
import time
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

from flask import g, request
from flask.logging import default_handler


LOG_FORMAT = '%(asctime)s | %(levelname)s | %(name)s | %(message)s'
DEFAULT_LOG_BACKUP_COUNT = int(os.environ.get('BACKEND_LOG_BACKUP_COUNT', '168'))
HTTP_LOG_BODY_PREVIEW_CHARS = int(os.environ.get('BACKEND_HTTP_LOG_BODY_PREVIEW_CHARS', '100'))
HTTP_LOG_BINARY_PREVIEW_BYTES = int(os.environ.get('BACKEND_HTTP_LOG_BINARY_PREVIEW_BYTES', '48'))
REDACTED_VALUE = '[REDACTED]'
SENSITIVE_KEY_MARKERS = (
    'apikey',
    'authorization',
    'cookie',
    'passwd',
    'passphrase',
    'password',
    'secret',
    'session',
    'token',
)
TEXT_BODY_MIME_PREFIXES = ('text/',)
TEXT_BODY_MIME_TYPES = {
    'application/json',
    'application/ld+json',
    'application/x-www-form-urlencoded',
    'application/xml',
}


def _resolve_log_level():
    configured_level = str(os.environ.get('BACKEND_LOG_LEVEL', 'INFO')).upper()
    return getattr(logging, configured_level, logging.INFO)


def _has_hourly_log_handler(logger, log_file_path):
    target_path = str(log_file_path)
    return any(
        isinstance(handler, TimedRotatingFileHandler)
        and getattr(handler, 'baseFilename', None) == target_path
        for handler in logger.handlers
    )


def _resolve_logs_directory():
    configured_directory = str(os.environ.get('BACKEND_LOG_DIR') or '').strip()
    if configured_directory:
        return Path(configured_directory)

    container_logs_directory = Path('/app/logs')
    if container_logs_directory.exists():
        return container_logs_directory

    return Path(__file__).resolve().parent.parent / 'logs'


def _serialize_headers(headers):
    serialized_headers = {}
    for key in headers.keys():
        values = headers.getlist(key)
        if _is_sensitive_key(key):
            serialized_headers[key] = REDACTED_VALUE
            continue
        serialized_headers[key] = values[0] if len(values) == 1 else values
    return serialized_headers


def _decode_body(preview_bytes):
    return (preview_bytes or b'').decode('utf-8', errors='replace')


def _compact_json(value):
    try:
        return json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    except TypeError:
        return json.dumps(str(value), ensure_ascii=False, separators=(',', ':'))


def _truncate_text(value):
    safe_value = '' if value is None else str(value)
    if HTTP_LOG_BODY_PREVIEW_CHARS <= 0 or len(safe_value) <= HTTP_LOG_BODY_PREVIEW_CHARS:
        return safe_value, False
    return safe_value[:HTTP_LOG_BODY_PREVIEW_CHARS], True


def _normalize_key_name(key):
    return ''.join(character for character in str(key or '').lower() if character.isalnum())


def _is_sensitive_key(key):
    normalized_key = _normalize_key_name(key)
    return any(marker in normalized_key for marker in SENSITIVE_KEY_MARKERS)


def _sanitize_logged_value(value, parent_key=''):
    if _is_sensitive_key(parent_key):
        return REDACTED_VALUE

    if isinstance(value, dict):
        sanitized_mapping = {}
        for item_key, item_value in value.items():
            sanitized_mapping[item_key] = _sanitize_logged_value(item_value, item_key)
        return sanitized_mapping

    if isinstance(value, list):
        return [_sanitize_logged_value(item) for item in value]

    if isinstance(value, tuple):
        return [_sanitize_logged_value(item) for item in value]

    return value


def _is_text_mimetype(mimetype):
    safe_mimetype = str(mimetype or '').lower()
    return (
        safe_mimetype.startswith(TEXT_BODY_MIME_PREFIXES)
        or safe_mimetype in TEXT_BODY_MIME_TYPES
        or safe_mimetype.endswith('+json')
        or safe_mimetype.endswith('+xml')
    )


def _serialize_form(mapping):
    serialized_form = {}
    for key in mapping.keys():
        values = mapping.getlist(key)
        raw_value = values[0] if len(values) == 1 else values
        serialized_form[key] = _sanitize_logged_value(raw_value, key)
    return serialized_form


def _serialize_uploaded_files(files):
    serialized_files = {}
    for field_name in files.keys():
        entries = []
        for storage in files.getlist(field_name):
            entries.append({
                'contentType': storage.content_type,
                'filename': storage.filename,
                'name': storage.name,
            })
        serialized_files[field_name] = entries[0] if len(entries) == 1 else entries
    return serialized_files


def _build_request_body_preview():
    raw_body = request.get_data(cache=True) or b''
    mimetype = str(request.mimetype or '').lower()

    if not raw_body and not request.files and not request.form:
        return '', False

    if mimetype.startswith('multipart/'):
        return _truncate_text(_compact_json({
            'files': _serialize_uploaded_files(request.files),
            'form': _serialize_form(request.form),
        }))

    if mimetype == 'application/x-www-form-urlencoded':
        return _truncate_text(_compact_json(_serialize_form(request.form)))

    if request.is_json:
        return _truncate_text(_compact_json(_sanitize_logged_value(request.get_json(silent=True))))

    if _is_text_mimetype(mimetype):
        return _truncate_text(_decode_body(raw_body))

    preview_bytes = raw_body[:HTTP_LOG_BINARY_PREVIEW_BYTES]
    return _truncate_text(f'base64:{base64.b64encode(preview_bytes).decode("ascii")}')


def _build_response_body_preview(response):
    if response.is_streamed or response.direct_passthrough:
        return _truncate_text(
            f'<stream contentType={response.content_type} contentLength={response.calculate_content_length()}>'
        )

    raw_body = response.get_data() or b''
    mimetype = str(response.mimetype or '').lower()

    if not raw_body:
        return '', False

    if response.is_json:
        return _truncate_text(_compact_json(_sanitize_logged_value(response.get_json(silent=True))))

    if _is_text_mimetype(mimetype):
        return _truncate_text(_decode_body(raw_body))

    preview_bytes = raw_body[:HTTP_LOG_BINARY_PREVIEW_BYTES]
    return _truncate_text(f'base64:{base64.b64encode(preview_bytes).decode("ascii")}')


def register_http_logging(app):
    @app.before_request
    def _log_request_start():
        g.backend_request_started_at = time.perf_counter()
        g.backend_request_log_id = f'{time.time_ns()}'

    @app.after_request
    def _log_request_complete(response):
        started_at = getattr(g, 'backend_request_started_at', None)
        duration_ms = round((time.perf_counter() - started_at) * 1000, 3) if started_at is not None else None
        request_body_preview, request_body_truncated = _build_request_body_preview()
        response_body_preview, response_body_truncated = _build_response_body_preview(response)
        app.logger.info(
            'HTTP [%sms] %s',
            '?' if duration_ms is None else duration_ms,
            _compact_json({
                'reqId': getattr(g, 'backend_request_log_id', None),
                'm': request.method,
                'uri': request.url,
                'st': response.status_code,
                'reqH': _serialize_headers(request.headers),
                'reqB': request_body_preview,
                'reqBTr': request_body_truncated,
                'resH': _serialize_headers(response.headers),
                'resB': response_body_preview,
                'resBTr': response_body_truncated,
            }),
        )
        return response


def configure_backend_logging(app):
    logs_directory = _resolve_logs_directory()
    logs_directory.mkdir(parents=True, exist_ok=True)
    log_file_path = logs_directory / 'backend.log'
    log_level = _resolve_log_level()

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    if not _has_hourly_log_handler(root_logger, log_file_path):
        hourly_file_handler = TimedRotatingFileHandler(
            log_file_path,
            when='H',
            interval=1,
            backupCount=DEFAULT_LOG_BACKUP_COUNT,
            encoding='utf-8',
        )
        hourly_file_handler.setLevel(log_level)
        hourly_file_handler.setFormatter(logging.Formatter(LOG_FORMAT))
        root_logger.addHandler(hourly_file_handler)

    if default_handler in app.logger.handlers:
        app.logger.removeHandler(default_handler)

    app.logger.setLevel(log_level)
    app.logger.propagate = True

    werkzeug_logger = logging.getLogger('werkzeug')
    werkzeug_logger.setLevel(log_level)
    werkzeug_logger.propagate = True

    app.logger.info('Hourly backend logging enabled at %s', log_file_path)