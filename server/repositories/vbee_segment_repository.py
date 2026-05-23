try:
    from services.auth_store import MYSQL_DATABASE, _connect
except ImportError:
    from ..services.auth_store import MYSQL_DATABASE, _connect


SUMMARY_SELECT = """
SELECT
    latest.cache_key,
    latest.text_content,
    latest.language,
    latest.voice_code,
    counts.request_count,
    COALESCE(c.audio_url, latest.audio_url) AS audio_url,
    c.expires_at AS expires_at,
    latest.provider_request_id,
    latest.token_id,
    latest.character_count,
    latest.error_message,
    latest.created_at,
    latest.updated_at,
    counts.queued_count,
    counts.processing_count,
    counts.complete_count,
    counts.failed_count
FROM (
    SELECT
        s.cache_key,
        COUNT(*) AS request_count,
        SUM(CASE WHEN s.status = %s THEN 1 ELSE 0 END) AS queued_count,
        SUM(CASE WHEN s.status = %s THEN 1 ELSE 0 END) AS processing_count,
        SUM(CASE WHEN s.status = %s THEN 1 ELSE 0 END) AS complete_count,
        SUM(CASE WHEN s.status = %s THEN 1 ELSE 0 END) AS failed_count
    FROM vbee_voice_segments s
    GROUP BY s.cache_key
) counts
INNER JOIN vbee_voice_segments latest
    ON latest.id = (
        SELECT s2.id
        FROM vbee_voice_segments s2
        WHERE s2.cache_key = counts.cache_key
        ORDER BY s2.updated_at DESC, s2.id DESC
        LIMIT 1
    )
LEFT JOIN vbee_audio_cache c ON c.cache_key = counts.cache_key
"""


def _summary_query_tail(where_clause=''):
    return f"{SUMMARY_SELECT}{where_clause} ORDER BY latest.updated_at DESC, latest.created_at DESC"


def _summary_query_params(queued_status, processing_status, complete_status, failed_status, *extra_params):
    return (queued_status, processing_status, complete_status, failed_status, *extra_params)


def list_vbee_segment_summary_rows(queued_status, processing_status, complete_status, failed_status):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                _summary_query_tail(),
                _summary_query_params(queued_status, processing_status, complete_status, failed_status),
            )
            return cursor.fetchall() or []
    finally:
        connection.close()


def get_vbee_segment_summary_row(cache_key, queued_status, processing_status, complete_status, failed_status):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                _summary_query_tail('WHERE counts.cache_key = %s'),
                _summary_query_params(queued_status, processing_status, complete_status, failed_status, cache_key),
            )
            return cursor.fetchone()
    finally:
        connection.close()


def list_vbee_segment_usage_rows(cache_key, limit=25):
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT * FROM vbee_voice_segments WHERE cache_key = %s ORDER BY updated_at DESC, id DESC LIMIT %s',
                (cache_key, int(limit)),
            )
            return cursor.fetchall() or []
    finally:
        connection.close()