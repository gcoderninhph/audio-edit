import json
import time

try:
    from services.auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _ensure_column, _require_driver, ensure_auth_schema
except ImportError:
    from ..services.auth_store import AuthStoreError, MYSQL_DATABASE, _connect, _ensure_column, _require_driver, ensure_auth_schema


VBEE_STATUS_QUEUED = 'queued'
VBEE_STATUS_PROCESSING = 'processing'
VBEE_STATUS_COMPLETE = 'complete'
VBEE_STATUS_FAILED = 'failed'
FINAL_VBEE_STATUSES = {VBEE_STATUS_COMPLETE, VBEE_STATUS_FAILED}
_schema_ready = False


class VbeeNotFoundError(AuthStoreError):
    pass


class VbeeValidationError(ValueError):
    pass


def now_timestamp():
    return int(time.time())


def json_dumps(payload):
    return json.dumps(payload or {}, ensure_ascii=False, separators=(',', ':'))


def json_loads(value, fallback=None):
    try:
        return json.loads(value) if value else (fallback if fallback is not None else {})
    except json.JSONDecodeError:
        return fallback if fallback is not None else {}


def normalize_text(value, field_name, max_length=255, required=True):
    text = ' '.join(str(value or '').strip().split())
    if required and not text:
        raise VbeeValidationError(f'{field_name} is required.')
    return text[:max_length]


def normalize_positive_int(value, field_name, default=1, maximum=20):
    if value in (None, ''):
        return default
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise VbeeValidationError(f'{field_name} must be a number.')
    if number < 1 or number > maximum:
        raise VbeeValidationError(f'{field_name} must be between 1 and {maximum}.')
    return number


def normalize_bool(value, default=True):
    if value is None:
        return bool(default)
    if isinstance(value, bool):
        return value
    return str(value or '').strip().lower() in {'1', 'true', 'yes', 'on'}


def mask_secret(secret):
    token = str(secret or '')
    if len(token) <= 8:
        return '*' * len(token)
    return f'{token[:4]}...{token[-4:]}'


def aggregate_status(total, completed, failed, queued, processing):
    if total > 0 and completed == total:
        return VBEE_STATUS_COMPLETE
    if failed > 0 and completed + failed == total:
        return VBEE_STATUS_FAILED
    if processing > 0:
        return VBEE_STATUS_PROCESSING
    return VBEE_STATUS_QUEUED


def row_to_request(row, segments=None):
    if not row:
        return None
    return {
        'requestId': row.get('request_id') or '',
        'userId': row.get('user_id') or '',
        'status': row.get('status') or VBEE_STATUS_QUEUED,
        'progress': int(row.get('progress') or 0),
        'queuePosition': int(row.get('queue_position') or 0),
        'totalSegments': int(row.get('total_segments') or 0),
        'completedSegments': int(row.get('completed_segments') or 0),
        'failedSegments': int(row.get('failed_segments') or 0),
        'characterCount': int(row.get('character_count') or 0),
        'language': row.get('language') or '',
        'voiceCode': row.get('voice_code') or '',
        'payload': json_loads(row.get('payload_json')),
        'downloadUrls': json_loads(row.get('result_urls_json'), []),
        'errorMessage': row.get('error_message') or '',
        'createdAt': int(row.get('created_at') or 0),
        'updatedAt': int(row.get('updated_at') or 0),
        'segments': segments or [],
    }


def row_to_segment(row):
    if not row:
        return None
    segment_id = str(row.get('id') or '').strip()
    token_id = str(row.get('token_id') or '').strip()
    return {
        'id': segment_id,
        'requestId': row.get('request_id') or '',
        'index': int(row.get('segment_index') or 0),
        'text': row.get('text_content') or '',
        'startMs': int(row.get('start_ms') or 0),
        'endMs': int(row.get('end_ms') or 0),
        'language': row.get('language') or '',
        'voiceCode': row.get('voice_code') or '',
        'cacheKey': row.get('cache_key') or '',
        'tokenId': token_id or None,
        'providerRequestId': row.get('provider_request_id') or '',
        'status': row.get('status') or VBEE_STATUS_QUEUED,
        'audioUrl': row.get('audio_url') or '',
        'fileName': row.get('file_name') or '',
        'errorMessage': row.get('error_message') or '',
        'characterCount': int(row.get('character_count') or 0),
        'expiresAt': int(row.get('expires_at') or 0),
        'createdAt': int(row.get('created_at') or 0),
        'updatedAt': int(row.get('updated_at') or 0),
    }


def ensure_vbee_schema():
    global _schema_ready
    if _schema_ready:
        return
    ensure_auth_schema()
    driver = _require_driver()
    try:
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS vbee_tokens (
                        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(120) NOT NULL,
                        client_id VARCHAR(160) NOT NULL DEFAULT '',
                        token_secret TEXT NOT NULL,
                        max_concurrent_requests INT NOT NULL DEFAULT 1,
                        is_active TINYINT(1) NOT NULL DEFAULT 1,
                        created_at BIGINT NOT NULL,
                        updated_at BIGINT NOT NULL,
                        INDEX idx_vbee_tokens_active (is_active)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS vbee_configs (
                        config_key VARCHAR(80) NOT NULL PRIMARY KEY,
                        config_value LONGTEXT NULL,
                        updated_at BIGINT NOT NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS vbee_voice_requests (
                        request_id VARCHAR(128) NOT NULL PRIMARY KEY,
                        user_id VARCHAR(80) NOT NULL,
                        status VARCHAR(32) NOT NULL,
                        progress INT NOT NULL DEFAULT 0,
                        queue_position INT NOT NULL DEFAULT 0,
                        total_segments INT NOT NULL DEFAULT 0,
                        completed_segments INT NOT NULL DEFAULT 0,
                        failed_segments INT NOT NULL DEFAULT 0,
                        character_count INT NOT NULL DEFAULT 0,
                        language VARCHAR(32) NOT NULL DEFAULT '',
                        voice_code VARCHAR(80) NOT NULL DEFAULT '',
                        payload_json LONGTEXT NULL,
                        result_urls_json LONGTEXT NULL,
                        error_message TEXT NULL,
                        created_at BIGINT NOT NULL,
                        updated_at BIGINT NOT NULL,
                        INDEX idx_vbee_requests_user_created (user_id, created_at),
                        INDEX idx_vbee_requests_status_created (status, created_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS vbee_voice_segments (
                        id VARCHAR(36) NOT NULL PRIMARY KEY,
                        request_id VARCHAR(128) NOT NULL,
                        segment_index INT NOT NULL,
                        text_content LONGTEXT NOT NULL,
                        start_ms INT NOT NULL DEFAULT 0,
                        end_ms INT NOT NULL DEFAULT 0,
                        language VARCHAR(32) NOT NULL DEFAULT '',
                        voice_code VARCHAR(80) NOT NULL DEFAULT '',
                        cache_key VARCHAR(96) NOT NULL,
                        token_id VARCHAR(36) NULL,
                        provider_request_id VARCHAR(160) NULL,
                        status VARCHAR(32) NOT NULL DEFAULT 'queued',
                        audio_url TEXT NULL,
                        error_message TEXT NULL,
                        character_count INT NOT NULL DEFAULT 0,
                        created_at BIGINT NOT NULL,
                        updated_at BIGINT NOT NULL,
                        UNIQUE KEY uniq_vbee_segment_request_index (request_id, segment_index),
                        INDEX idx_vbee_segments_status_created (status, created_at),
                        INDEX idx_vbee_segments_token_status (token_id, status),
                        INDEX idx_vbee_segments_provider_request (provider_request_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS vbee_audio_cache (
                        cache_key VARCHAR(96) NOT NULL PRIMARY KEY,
                        language VARCHAR(32) NOT NULL DEFAULT '',
                        voice_code VARCHAR(80) NOT NULL DEFAULT '',
                        text_hash VARCHAR(64) NOT NULL DEFAULT '',
                        audio_url TEXT NOT NULL,
                        file_name VARCHAR(255) NOT NULL DEFAULT '',
                        provider_request_id VARCHAR(160) NULL,
                        character_count INT NOT NULL DEFAULT 0,
                        expires_at BIGINT NOT NULL DEFAULT 0,
                        created_at BIGINT NOT NULL,
                        updated_at BIGINT NOT NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    """
                )
                _ensure_column(cursor, 'vbee_voice_requests', 'queue_position', 'INT NOT NULL DEFAULT 0 AFTER progress')
                _ensure_column(cursor, 'vbee_audio_cache', 'file_name', "VARCHAR(255) NOT NULL DEFAULT '' AFTER audio_url")
                _ensure_column(cursor, 'vbee_audio_cache', 'expires_at', 'BIGINT NOT NULL DEFAULT 0 AFTER character_count')
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise AuthStoreError('Unable to initialize Vbee schema') from error
    _schema_ready = True