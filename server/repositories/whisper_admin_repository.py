try:
    from repositories.request_repository import ensure_request_tables
    from utils.mysql_connection import connect_mysql, load_mysql_settings, require_mysql_driver
except ImportError:
    from .request_repository import ensure_request_tables
    from ..utils.mysql_connection import connect_mysql, load_mysql_settings, require_mysql_driver


class WhisperAdminRepositoryError(RuntimeError):
    pass


_MYSQL_SETTINGS = load_mysql_settings(['REQUEST', 'AUTH'])
MYSQL_DATABASE = _MYSQL_SETTINGS['database']
WHISPER_PROVIDER_NAMES = ('whisper', 'whishper')
WHISPER_PROCESSING_STATUSES = ('processing', 'running')


def _require_driver():
    return require_mysql_driver(WhisperAdminRepositoryError)


def _connect(database=None):
    return connect_mysql(_MYSQL_SETTINGS, error_cls=WhisperAdminRepositoryError, database=database)


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


def ensure_whisper_admin_tables():
    driver = _require_driver()
    try:
        ensure_request_tables()
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS whisper_processing_nodes (
                        node_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                        node_name VARCHAR(255) NOT NULL DEFAULT '',
                        node_url VARCHAR(512) NOT NULL,
                        max_concurrent_requests INT NOT NULL DEFAULT 1,
                        created_at DOUBLE NOT NULL,
                        updated_at DOUBLE NOT NULL,
                        UNIQUE KEY uniq_whisper_processing_nodes_url (node_url),
                        INDEX idx_whisper_processing_nodes_updated (updated_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    """
                )
                _ensure_column(
                    cursor,
                    'whisper_processing_nodes',
                    'node_name',
                    "VARCHAR(255) NOT NULL DEFAULT '' AFTER node_id",
                )
                _ensure_column(
                    cursor,
                    'whisper_processing_nodes',
                    'max_concurrent_requests',
                    'INT NOT NULL DEFAULT 1 AFTER node_url',
                )
                cursor.execute(
                    """
                    UPDATE whisper_processing_nodes
                    SET node_name = node_url
                    WHERE TRIM(COALESCE(node_name, '')) = ''
                    """
                )
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise WhisperAdminRepositoryError('Unable to initialize Whisper admin tables') from error


def count_whisper_request_rows(status=''):
    driver = _require_driver()
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            if status == 'processing':
                cursor.execute(
                    """
                    SELECT COUNT(*) AS total_items
                    FROM server_requests
                    WHERE request_type = %s
                      AND provider IN (%s, %s)
                      AND status IN (%s, %s)
                    """,
                    ('transcription', *WHISPER_PROVIDER_NAMES, *WHISPER_PROCESSING_STATUSES),
                )
            elif status:
                cursor.execute(
                    """
                    SELECT COUNT(*) AS total_items
                    FROM server_requests
                    WHERE request_type = %s
                      AND provider IN (%s, %s)
                      AND status = %s
                    """,
                    ('transcription', *WHISPER_PROVIDER_NAMES, status),
                )
            else:
                cursor.execute(
                    """
                    SELECT COUNT(*) AS total_items
                    FROM server_requests
                    WHERE request_type = %s
                      AND provider IN (%s, %s)
                    """,
                    ('transcription', *WHISPER_PROVIDER_NAMES),
                )
            return int((cursor.fetchone() or {}).get('total_items') or 0)
    except driver.MySQLError as error:
        raise WhisperAdminRepositoryError('Unable to count Whisper requests') from error
    finally:
        connection.close()


def list_whisper_request_rows(status, page_size, offset):
    driver = _require_driver()
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            if status == 'processing':
                cursor.execute(
                    """
                    SELECT *
                    FROM server_requests
                    WHERE request_type = %s
                      AND provider IN (%s, %s)
                      AND status IN (%s, %s)
                    ORDER BY updated_at DESC, created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    ('transcription', *WHISPER_PROVIDER_NAMES, *WHISPER_PROCESSING_STATUSES, int(page_size), int(offset)),
                )
            elif status:
                cursor.execute(
                    """
                    SELECT *
                    FROM server_requests
                    WHERE request_type = %s
                      AND provider IN (%s, %s)
                      AND status = %s
                    ORDER BY updated_at DESC, created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    ('transcription', *WHISPER_PROVIDER_NAMES, status, int(page_size), int(offset)),
                )
            else:
                cursor.execute(
                    """
                    SELECT *
                    FROM server_requests
                    WHERE request_type = %s
                      AND provider IN (%s, %s)
                    ORDER BY updated_at DESC, created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    ('transcription', *WHISPER_PROVIDER_NAMES, int(page_size), int(offset)),
                )
            return cursor.fetchall() or []
    except driver.MySQLError as error:
        raise WhisperAdminRepositoryError('Unable to list Whisper requests') from error
    finally:
        connection.close()


def list_whisper_processing_node_rows():
    driver = _require_driver()
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT node_id, node_name, node_url, max_concurrent_requests, created_at, updated_at
                FROM whisper_processing_nodes
                ORDER BY updated_at DESC, node_id DESC
                """
            )
            return cursor.fetchall() or []
    except driver.MySQLError as error:
        raise WhisperAdminRepositoryError('Unable to list Whisper processing nodes') from error
    finally:
        connection.close()


def insert_whisper_processing_node_row(node_name, node_url, max_concurrent_requests, created_at, updated_at):
    driver = _require_driver()
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO whisper_processing_nodes (node_name, node_url, max_concurrent_requests, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (str(node_name or '').strip(), node_url, int(max_concurrent_requests), float(created_at), float(updated_at)),
            )
    except driver.MySQLError as error:
        raise WhisperAdminRepositoryError('Unable to create Whisper processing node') from error
    finally:
        connection.close()


def update_whisper_processing_node_row(node_id, node_name, node_url, max_concurrent_requests, updated_at):
    driver = _require_driver()
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE whisper_processing_nodes
                SET node_name = %s,
                    node_url = %s,
                    max_concurrent_requests = %s,
                    updated_at = %s
                WHERE node_id = %s
                """,
                (
                    str(node_name or '').strip(),
                    node_url,
                    int(max_concurrent_requests),
                    float(updated_at),
                    int(node_id),
                ),
            )
            return int(cursor.rowcount or 0) > 0
    except driver.MySQLError as error:
        raise WhisperAdminRepositoryError('Unable to update Whisper processing node') from error
    finally:
        connection.close()


def delete_whisper_processing_node_row(node_id):
    driver = _require_driver()
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM whisper_processing_nodes
                WHERE node_id = %s
                """,
                (int(node_id),),
            )
            return int(cursor.rowcount or 0) > 0
    except driver.MySQLError as error:
        raise WhisperAdminRepositoryError('Unable to delete Whisper processing node') from error
    finally:
        connection.close()


def list_queued_whisper_request_rows(limit=50, preferred_request_id=''):
    driver = _require_driver()
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            safe_preferred_request_id = str(preferred_request_id or '').strip()
            if safe_preferred_request_id:
                cursor.execute(
                    """
                    SELECT *
                    FROM server_requests
                    WHERE request_type = %s
                      AND provider IN (%s, %s)
                      AND status = %s
                    ORDER BY CASE WHEN request_id = %s THEN 0 ELSE 1 END, created_at ASC, request_id ASC
                    LIMIT %s
                    """,
                    ('transcription', *WHISPER_PROVIDER_NAMES, 'queued', safe_preferred_request_id, int(limit)),
                )
            else:
                cursor.execute(
                    """
                    SELECT *
                    FROM server_requests
                    WHERE request_type = %s
                      AND provider IN (%s, %s)
                      AND status = %s
                    ORDER BY created_at ASC, request_id ASC
                    LIMIT %s
                    """,
                    ('transcription', *WHISPER_PROVIDER_NAMES, 'queued', int(limit)),
                )
            return cursor.fetchall() or []
    except driver.MySQLError as error:
        raise WhisperAdminRepositoryError('Unable to list queued Whisper requests') from error
    finally:
        connection.close()


def list_processing_whisper_request_rows(limit=50):
    driver = _require_driver()
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT *
                FROM server_requests
                WHERE request_type = %s
                  AND provider IN (%s, %s)
                  AND status IN (%s, %s)
                ORDER BY updated_at ASC, created_at ASC
                LIMIT %s
                """,
                ('transcription', *WHISPER_PROVIDER_NAMES, *WHISPER_PROCESSING_STATUSES, int(limit)),
            )
            return cursor.fetchall() or []
    except driver.MySQLError as error:
        raise WhisperAdminRepositoryError('Unable to list processing Whisper requests') from error
    finally:
        connection.close()


def count_whisper_queue_position_row(request_id):
    driver = _require_driver()
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COUNT(*) AS queue_position
                FROM server_requests AS earlier
                JOIN server_requests AS target
                  ON target.request_id = %s
                WHERE target.request_type = %s
                  AND target.provider IN (%s, %s)
                  AND target.status = %s
                  AND earlier.request_type = target.request_type
                  AND earlier.provider IN (%s, %s)
                  AND earlier.status = %s
                  AND (
                    earlier.created_at < target.created_at
                    OR (earlier.created_at = target.created_at AND earlier.request_id <= target.request_id)
                  )
                """,
                (request_id, 'transcription', *WHISPER_PROVIDER_NAMES, 'queued', *WHISPER_PROVIDER_NAMES, 'queued'),
            )
            return int((cursor.fetchone() or {}).get('queue_position') or 0)
    except driver.MySQLError as error:
        raise WhisperAdminRepositoryError('Unable to count Whisper queue position') from error
    finally:
        connection.close()


def acquire_whisper_named_lock(lock_name, timeout_seconds=0):
    driver = _require_driver()
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT GET_LOCK(%s, %s) AS acquired', (str(lock_name or ''), int(timeout_seconds or 0)))
            row = cursor.fetchone() or {}
            if int(row.get('acquired') or 0) != 1:
                connection.close()
                return None
            return connection
    except driver.MySQLError as error:
        connection.close()
        raise WhisperAdminRepositoryError('Unable to acquire Whisper runtime lock') from error


def release_whisper_named_lock(connection, lock_name):
    if connection is None:
        return
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT RELEASE_LOCK(%s) AS released', (str(lock_name or ''),))
    except Exception:
        pass
    finally:
        connection.close()