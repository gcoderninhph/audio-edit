import json
import os

try:
    import redis
except ImportError as import_error:
    redis = None
    REDIS_IMPORT_ERROR = import_error
else:
    REDIS_IMPORT_ERROR = None


IAP_CACHE_PREFIX = os.environ.get('IAP_REDIS_PREFIX') or os.environ.get('REDIS_PREFIX', 'audio_editor')
IAP_CACHE_TTL_SECONDS = int(os.environ.get('IAP_CACHE_TTL_SECONDS', '120'))
IAP_REDIS_DB = int(os.environ.get('IAP_REDIS_DB', '0'))
IAP_REDIS_HOST = os.environ.get('IAP_REDIS_HOST') or os.environ.get('REDIS_HOST', 'localhost')
IAP_REDIS_PORT = int(os.environ.get('IAP_REDIS_PORT') or os.environ.get('REDIS_PORT', '6379'))
PUBLIC_IAP_PACKAGES_CACHE_KEY = f'{IAP_CACHE_PREFIX}:iap:packages:public'

_cached_client = None


def _get_cache_client():
    global _cached_client
    if redis is None:
        return None
    if _cached_client is None:
        _cached_client = redis.Redis(
            host=IAP_REDIS_HOST,
            port=IAP_REDIS_PORT,
            db=IAP_REDIS_DB,
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
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
