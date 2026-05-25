try:
    from repositories.request_repository import ensure_request_tables
    from utils.mysql_connection import connect_mysql, load_mysql_settings, require_mysql_driver
except ImportError:
    from .request_repository import ensure_request_tables
    from ..utils.mysql_connection import connect_mysql, load_mysql_settings, require_mysql_driver


class WhisperConfigRepositoryError(RuntimeError):
    pass


_MYSQL_SETTINGS = load_mysql_settings(['REQUEST', 'AUTH'])
MYSQL_DATABASE = _MYSQL_SETTINGS['database']


def _require_driver():
    return require_mysql_driver(WhisperConfigRepositoryError)


def _connect(database=None):
    return connect_mysql(_MYSQL_SETTINGS, error_cls=WhisperConfigRepositoryError, database=database)


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


def ensure_whisper_config_table():
    driver = _require_driver()
    try:
        ensure_request_tables()
        connection = _connect(MYSQL_DATABASE)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS whisper_service_config (
                        id TINYINT NOT NULL PRIMARY KEY,
                        detect_credit_per_minute DOUBLE NOT NULL DEFAULT 20,
                        created_at DOUBLE NOT NULL,
                        updated_at DOUBLE NOT NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                    """
                )
                _ensure_column(
                    cursor,
                    'whisper_service_config',
                    'detect_credit_per_minute',
                    'DOUBLE NOT NULL DEFAULT 20 AFTER id',
                )
        finally:
            connection.close()
    except driver.MySQLError as error:
        raise WhisperConfigRepositoryError('Unable to initialize Whisper config table') from error


def get_whisper_service_config_row():
    driver = _require_driver()
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT * FROM whisper_service_config WHERE id = 1 LIMIT 1')
            return cursor.fetchone()
    except driver.MySQLError as error:
        raise WhisperConfigRepositoryError('Unable to read Whisper service config') from error
    finally:
        connection.close()


def upsert_whisper_service_config_row(config_row, updated_at):
    driver = _require_driver()
    connection = _connect(MYSQL_DATABASE)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO whisper_service_config
                    (id, detect_credit_per_minute, created_at, updated_at)
                VALUES (1, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    detect_credit_per_minute = VALUES(detect_credit_per_minute),
                    updated_at = VALUES(updated_at)
                """,
                (
                    float(config_row['detectCreditPerMinute']),
                    float(updated_at),
                    float(updated_at),
                ),
            )
    except driver.MySQLError as error:
        raise WhisperConfigRepositoryError('Unable to update Whisper service config') from error
    finally:
        connection.close()