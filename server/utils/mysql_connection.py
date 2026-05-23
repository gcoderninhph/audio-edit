import os

try:
    import pymysql
except ImportError as import_error:
    pymysql = None
    PYMYSQL_IMPORT_ERROR = import_error
else:
    PYMYSQL_IMPORT_ERROR = None


def _resolve_env_value(keys, default_value=''):
    for key in keys:
        value = os.environ.get(key)
        if value not in (None, ''):
            return value
    return default_value


def _build_env_keys(scopes, field_name):
    scope_keys = [f'{scope}_MYSQL_{field_name}' for scope in scopes if scope]
    return scope_keys + [f'MYSQL_{field_name}']


def load_mysql_settings(scopes=()):
    normalized_scopes = [str(scope or '').strip().upper() for scope in scopes if str(scope or '').strip()]
    return {
        'host': _resolve_env_value(_build_env_keys(normalized_scopes, 'HOST'), 'localhost'),
        'port': int(_resolve_env_value(_build_env_keys(normalized_scopes, 'PORT'), '3306')),
        'user': _resolve_env_value(_build_env_keys(normalized_scopes, 'USER'), 'root'),
        'password': _resolve_env_value(_build_env_keys(normalized_scopes, 'PASSWORD'), '12345678'),
        'database': _resolve_env_value(_build_env_keys(normalized_scopes, 'DATABASE'), 'audio_studio'),
    }


def require_mysql_driver(error_cls=RuntimeError):
    if pymysql is None:
        raise error_cls('PyMySQL is not installed') from PYMYSQL_IMPORT_ERROR
    return pymysql


def quote_mysql_identifier(identifier, error_cls=RuntimeError):
    safe_identifier = ''.join(ch for ch in str(identifier or '') if ch.isalnum() or ch == '_')
    if not safe_identifier:
        raise error_cls('Invalid MySQL database name')
    return f'`{safe_identifier}`'


def connect_mysql(settings, *, error_cls=RuntimeError, database=None):
    driver = require_mysql_driver(error_cls)
    try:
        return driver.connect(
            host=settings['host'],
            port=settings['port'],
            user=settings['user'],
            password=settings['password'],
            database=database,
            charset='utf8mb4',
            cursorclass=driver.cursors.DictCursor,
            autocommit=True,
        )
    except driver.MySQLError as error:
        raise error_cls('Unable to connect to MySQL') from error