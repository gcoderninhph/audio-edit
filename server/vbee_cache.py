import hashlib
import json
import os

try:
    from redis_connection import get_cached_redis_client, load_redis_settings
except ImportError:
    from .redis_connection import get_cached_redis_client, load_redis_settings


_REDIS_SETTINGS = load_redis_settings(['VBEE', 'IAP'])
VBEE_CACHE_PREFIX = _REDIS_SETTINGS['prefix']
VBEE_REDIS_DB = _REDIS_SETTINGS['db']
VBEE_REDIS_HOST = _REDIS_SETTINGS['host']
VBEE_REDIS_PORT = _REDIS_SETTINGS['port']
VBEE_REQUEST_TTL_SECONDS = int(os.environ.get('VBEE_REQUEST_CACHE_TTL_SECONDS', '86400'))
VBEE_AUDIO_CACHE_TTL_SECONDS = int(os.environ.get('VBEE_AUDIO_CACHE_TTL_SECONDS', '259200'))

_cached_client = None


def _get_client():
    global _cached_client
    _cached_client = get_cached_redis_client(_cached_client, _REDIS_SETTINGS)
    return _cached_client


def build_audio_cache_key(text, voice_code='', language=''):
    normalized_payload = json.dumps({
        'language': str(language or '').strip().lower(),
        'text': ' '.join(str(text or '').split()),
        'voice': str(voice_code or '').strip().lower(),
    }, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    digest = hashlib.sha256(normalized_payload.encode('utf-8')).hexdigest()
    return f'vbee-audio-{digest}'


def _cache_key(kind, key):
    return f'{VBEE_CACHE_PREFIX}:vbee:{kind}:{key}'


def get_cached_audio(cache_key):
    client = _get_client()
    if client is None:
        return None
    try:
        payload = client.get(_cache_key('audio', cache_key))
        return json.loads(payload) if payload else None
    except Exception:
        return None


def set_cached_audio(cache_key, payload):
    client = _get_client()
    if client is None:
        return False
    try:
        client.setex(_cache_key('audio', cache_key), VBEE_AUDIO_CACHE_TTL_SECONDS, json.dumps(payload or {}, ensure_ascii=False))
        return True
    except Exception:
        return False


def delete_cached_audio(cache_key):
    client = _get_client()
    if client is None:
        return False
    try:
        client.delete(_cache_key('audio', cache_key))
        return True
    except Exception:
        return False


def get_cached_request_status(request_id):
    client = _get_client()
    if client is None:
        return None
    try:
        payload = client.get(_cache_key('request', request_id))
        return json.loads(payload) if payload else None
    except Exception:
        return None


def set_cached_request_status(request_id, payload):
    client = _get_client()
    if client is None:
        return False
    try:
        client.setex(_cache_key('request', request_id), VBEE_REQUEST_TTL_SECONDS, json.dumps(payload or {}, ensure_ascii=False))
        return True
    except Exception:
        return False


def delete_cached_request_status(request_id):
    client = _get_client()
    if client is None:
        return False
    try:
        client.delete(_cache_key('request', request_id))
        return True
    except Exception:
        return False


def clear_all_vbee_cached_state():
    client = _get_client()
    if client is None:
        return 0
    try:
        deleted_count = 0
        for cache_key in client.scan_iter(match=_cache_key('*', '*'), count=200):
            deleted_count += int(client.delete(cache_key) or 0)
        return deleted_count
    except Exception:
        return 0