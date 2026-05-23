import json
import os

try:
    from utils.redis_connection import get_cached_redis_client, load_redis_settings
except ImportError:
    from ..utils.redis_connection import get_cached_redis_client, load_redis_settings


_REDIS_SETTINGS = load_redis_settings(['IAP'])
IAP_CACHE_PREFIX = _REDIS_SETTINGS['prefix']
IAP_CACHE_TTL_SECONDS = int(os.environ.get('IAP_CACHE_TTL_SECONDS', '120'))
IAP_REDIS_DB = _REDIS_SETTINGS['db']
IAP_REDIS_HOST = _REDIS_SETTINGS['host']
IAP_REDIS_PORT = _REDIS_SETTINGS['port']
PUBLIC_IAP_PACKAGES_CACHE_KEY = f'{IAP_CACHE_PREFIX}:iap:packages:public'

_cached_client = None


def _get_cache_client():
    global _cached_client
    _cached_client = get_cached_redis_client(_cached_client, _REDIS_SETTINGS)
    return _cached_client


def get_cached_public_iap_packages():
    client = _get_cache_client()
    if client is None:
        return None
    try:
        payload = client.get(PUBLIC_IAP_PACKAGES_CACHE_KEY)
        return json.loads(payload) if payload else None
    except Exception:
        return None


def set_cached_public_iap_packages(packages):
    client = _get_cache_client()
    if client is None:
        return False
    try:
        client.setex(PUBLIC_IAP_PACKAGES_CACHE_KEY, IAP_CACHE_TTL_SECONDS, json.dumps(packages, ensure_ascii=False))
        return True
    except Exception:
        return False


def invalidate_public_iap_packages_cache():
    client = _get_cache_client()
    if client is None:
        return False
    try:
        client.delete(PUBLIC_IAP_PACKAGES_CACHE_KEY)
        return True
    except Exception:
        return False
