import os

try:
    import redis
except ImportError:
    redis = None


def _resolve_env_value(keys, default_value=''):
    for key in keys:
        value = os.environ.get(key)
        if value not in (None, ''):
            return value
    return default_value


def _build_env_keys(scopes, field_name):
    scope_keys = [f'{scope}_REDIS_{field_name}' for scope in scopes if scope]
    return scope_keys + [f'REDIS_{field_name}']


def load_redis_settings(scopes=(), *, prefix_scopes=None, default_prefix='audio_editor'):
    normalized_scopes = [str(scope or '').strip().upper() for scope in scopes if str(scope or '').strip()]
    normalized_prefix_scopes = normalized_scopes if prefix_scopes is None else [
        str(scope or '').strip().upper() for scope in prefix_scopes if str(scope or '').strip()
    ]
    return {
        'host': _resolve_env_value(_build_env_keys(normalized_scopes, 'HOST'), 'localhost'),
        'port': int(_resolve_env_value(_build_env_keys(normalized_scopes, 'PORT'), '6379')),
        'db': int(_resolve_env_value(_build_env_keys(normalized_scopes, 'DB'), '0')),
        'prefix': _resolve_env_value(_build_env_keys(normalized_prefix_scopes, 'PREFIX'), default_prefix),
    }


def get_cached_redis_client(existing_client, settings, *, decode_responses=True, socket_connect_timeout=1, socket_timeout=1):
    if redis is None:
        return None
    if existing_client is not None:
        return existing_client
    return redis.Redis(
        host=settings['host'],
        port=settings['port'],
        db=settings['db'],
        decode_responses=decode_responses,
        socket_connect_timeout=socket_connect_timeout,
        socket_timeout=socket_timeout,
    )