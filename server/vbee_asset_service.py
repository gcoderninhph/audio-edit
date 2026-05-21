import logging
import os
import time
from urllib.parse import quote

import boto3
import requests

try:
    from botocore.config import Config as BotoConfig
except ImportError:  # pragma: no cover - boto3 should provide botocore
    BotoConfig = None

try:
    from vbee_cache import clear_all_vbee_cached_state, delete_cached_audio, get_cached_audio, set_cached_audio
    from vbee_store import (
        clear_all_vbee_request_data,
        clear_vbee_segment_audio_urls,
        delete_vbee_audio_cache,
        get_latest_completed_vbee_segment_for_reuse,
        get_vbee_audio_cache,
        get_vbee_config,
        get_vbee_token,
        list_expired_vbee_audio_cache,
        save_vbee_audio_cache,
        touch_vbee_audio_cache_expiry,
    )
except ImportError:
    from .vbee_cache import clear_all_vbee_cached_state, delete_cached_audio, get_cached_audio, set_cached_audio
    from .vbee_store import (
        clear_all_vbee_request_data,
        clear_vbee_segment_audio_urls,
        delete_vbee_audio_cache,
        get_latest_completed_vbee_segment_for_reuse,
        get_vbee_audio_cache,
        get_vbee_config,
        get_vbee_token,
        list_expired_vbee_audio_cache,
        save_vbee_audio_cache,
        touch_vbee_audio_cache_expiry,
    )


VBEE_SEGMENT_EXPIRY_SECONDS = int(os.environ.get('VBEE_SEGMENT_EXPIRY_SECONDS', str(3 * 24 * 60 * 60)))
VBEE_SEGMENT_BACKFILL_MAX_AGE_SECONDS = VBEE_SEGMENT_EXPIRY_SECONDS
_cached_client = None


def _now():
    return int(time.time())


def _segment_asset_expires_at(now=None):
    return int(now or _now()) + VBEE_SEGMENT_EXPIRY_SECONDS


def _r2_config():
    domain = str(os.environ.get('CLOUDFLARE_R2_DOMAIN') or '').strip().rstrip('/')
    endpoint_url = str(os.environ.get('CLOUDFLARE_R2_REGION') or '').strip().rstrip('/')
    bucket_name = str(os.environ.get('CLOUDFLARE_R2_BUCKET_NAME') or '').strip()
    access_key_id = str(os.environ.get('CLOUDFLARE_R2_ACCESS_KEY_ID') or '').strip()
    secret_access_key = str(os.environ.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') or '').strip()
    return {
        'accessKeyId': access_key_id,
        'bucketName': bucket_name,
        'domain': domain,
        'endpointUrl': endpoint_url,
        'secretAccessKey': secret_access_key,
    }


def _require_r2_config():
    config = _r2_config()
    missing = [key for key, value in config.items() if not value]
    if missing:
        raise RuntimeError('Cloudflare R2 configuration is incomplete for Vbee segment storage.')
    return config


def _get_r2_client():
    global _cached_client
    if _cached_client is not None:
        return _cached_client
    config = _require_r2_config()
    client_kwargs = {
        'aws_access_key_id': config['accessKeyId'],
        'aws_secret_access_key': config['secretAccessKey'],
        'endpoint_url': config['endpointUrl'],
        'region_name': 'auto',
    }
    if BotoConfig is not None:
        client_kwargs['config'] = BotoConfig(signature_version='s3v4')
    _cached_client = boto3.client('s3', **client_kwargs)
    return _cached_client


def _extract_file_name(headers, fallback_name):
    content_disposition = str(headers.get('content-disposition') or '')
    if 'filename' not in content_disposition.lower():
        return fallback_name
    for part in content_disposition.split(';'):
        item = part.strip()
        if item.lower().startswith('filename*='):
            value = item.split('=', 1)[1].strip().strip('"')
            if "''" in value:
                value = value.split("''", 1)[1]
            return value or fallback_name
        if item.lower().startswith('filename='):
            return item.split('=', 1)[1].strip().strip('"') or fallback_name
    return fallback_name


def _infer_extension(file_name, mime_type, fallback_extension='.wav'):
    lower_name = str(file_name or '').strip().lower()
    if '.' in lower_name:
        extension = lower_name.rsplit('.', 1)[-1]
        if extension:
            return f'.{extension}'
    mime = str(mime_type or '').lower()
    if 'mpeg' in mime or 'mp3' in mime:
        return '.mp3'
    if 'ogg' in mime:
        return '.ogg'
    if 'mp4' in mime or 'aac' in mime:
        return '.m4a'
    if 'wav' in mime:
        return '.wav'
    return fallback_extension


def _build_file_name(cache_key, source_file_name='', mime_type='application/octet-stream'):
    return f"{cache_key}{_infer_extension(source_file_name, mime_type)}"


def _build_download_url(file_name):
    domain = _require_r2_config()['domain']
    return f'{domain}/{quote(file_name)}'


def _download_provider_audio(source_audio_url, fallback_name):
    response = requests.get(source_audio_url, timeout=60)
    response.raise_for_status()
    file_name = _extract_file_name(response.headers, fallback_name)
    return {
        'bytes': response.content,
        'fileName': file_name,
        'mimeType': response.headers.get('content-type') or 'application/octet-stream',
    }


def _upload_segment_bytes(file_name, payload):
    config = _require_r2_config()
    client = _get_r2_client()
    client.put_object(
        Bucket=config['bucketName'],
        Key=file_name,
        Body=payload['bytes'],
        ContentType=payload.get('mimeType') or 'application/octet-stream',
    )
    return _build_download_url(file_name)


def _is_asset_active(asset_record):
    if not asset_record or not asset_record.get('audioUrl') or not asset_record.get('fileName'):
        return False
    expires_at = int(asset_record.get('expiresAt') or 0)
    if expires_at <= 0:
        return False
    return expires_at > _now()


def get_active_vbee_segment_asset(cache_key):
    asset_record = get_cached_audio(cache_key) or get_vbee_audio_cache(cache_key)
    if not _is_asset_active(asset_record):
        return None
    return asset_record


def reuse_vbee_segment_asset(cache_key, allow_backfill=True):
    active_asset = get_active_vbee_segment_asset(cache_key)
    if active_asset:
        refreshed_expires_at = _segment_asset_expires_at()
        refreshed_asset = touch_vbee_audio_cache_expiry(cache_key, refreshed_expires_at) or active_asset
        refreshed_payload = {
            **active_asset,
            **(refreshed_asset or {}),
            'expiresAt': refreshed_expires_at,
            'updatedAt': _now(),
        }
        set_cached_audio(cache_key, refreshed_payload)
        return refreshed_payload
    if not allow_backfill:
        return None
    reusable_segment = get_latest_completed_vbee_segment_for_reuse(cache_key)
    if not reusable_segment:
        return None
    if (_now() - int(reusable_segment.get('updatedAt') or 0)) > VBEE_SEGMENT_BACKFILL_MAX_AGE_SECONDS:
        return None
    token_id = reusable_segment.get('tokenId')
    provider_request_id = reusable_segment.get('providerRequestId') or ''
    if not token_id or not provider_request_id:
        return None
    try:
        token = get_vbee_token(token_id, include_secret=True)
        config = get_vbee_config()
        api_base_url = str(config.get('apiBaseUrl') or 'https://vbee.vn/api/v1/tts').rstrip('/')
        response = requests.get(
            f'{api_base_url}/{provider_request_id}',
            headers={
                'Accept': 'application/json',
                'Authorization': f"Bearer {token.get('token') or ''}",
                'Content-Type': 'application/json',
            },
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json() if response.content else {}
        result = payload.get('result') if isinstance(payload.get('result'), dict) else {}
        source_audio_url = str(result.get('audio_link') or result.get('audio_url') or payload.get('audio_link') or payload.get('audio_url') or '').strip()
        if not source_audio_url:
            return None
        return store_vbee_segment_audio_asset(
            cache_key,
            reusable_segment.get('language') or '',
            reusable_segment.get('voiceCode') or '',
            source_audio_url,
            provider_request_id,
            reusable_segment.get('characterCount') or 0,
        )
    except Exception:
        return None


def store_vbee_segment_audio_asset(cache_key, language, voice_code, source_audio_url, provider_request_id, character_count):
    if not source_audio_url:
        raise RuntimeError('Vbee did not return an audio URL to persist.')
    existing_asset = get_active_vbee_segment_asset(cache_key)
    if existing_asset:
        refreshed_expires_at = _segment_asset_expires_at()
        refreshed_asset = touch_vbee_audio_cache_expiry(cache_key, refreshed_expires_at) or existing_asset
        refreshed_payload = {
            **existing_asset,
            **(refreshed_asset or {}),
            'expiresAt': refreshed_expires_at,
            'updatedAt': _now(),
        }
        set_cached_audio(cache_key, refreshed_payload)
        return refreshed_payload
    downloaded_audio = _download_provider_audio(source_audio_url, f'{cache_key}.wav')
    file_name = _build_file_name(cache_key, downloaded_audio.get('fileName'), downloaded_audio.get('mimeType'))
    download_url = _upload_segment_bytes(file_name, downloaded_audio)
    expires_at = _segment_asset_expires_at()
    save_vbee_audio_cache(
        cache_key,
        language,
        voice_code,
        download_url,
        provider_request_id,
        character_count,
        file_name=file_name,
        expires_at=expires_at,
    )
    payload = {
        'audioUrl': download_url,
        'cacheKey': cache_key,
        'characterCount': int(character_count or 0),
        'expiresAt': expires_at,
        'fileName': file_name,
        'providerRequestId': provider_request_id,
        'updatedAt': _now(),
    }
    set_cached_audio(cache_key, payload)
    return payload


def get_vbee_segment_asset_download_url(cache_key):
    active_asset = get_active_vbee_segment_asset(cache_key)
    return active_asset.get('audioUrl') if active_asset else ''


def expire_vbee_segment_assets(limit=100):
    expired_assets = list_expired_vbee_audio_cache(limit=limit)
    if not expired_assets:
        return 0
    deleted_count = 0
    client = None
    config = None
    for asset in expired_assets:
        try:
            if asset.get('fileName'):
                if client is None:
                    config = _require_r2_config()
                    client = _get_r2_client()
                client.delete_object(Bucket=config['bucketName'], Key=asset['fileName'])
        except Exception as error:  # pragma: no cover - defensive cleanup logging
            logging.getLogger(__name__).warning('Unable to delete expired Vbee segment asset %s from R2: %s', asset.get('fileName'), error)
        try:
            clear_vbee_segment_audio_urls(asset.get('cacheKey') or '', asset.get('audioUrl') or '')
            delete_vbee_audio_cache(asset.get('cacheKey') or '')
            delete_cached_audio(asset.get('cacheKey') or '')
            deleted_count += 1
        except Exception as error:  # pragma: no cover - defensive cleanup logging
            logging.getLogger(__name__).warning('Unable to expire Vbee segment asset %s from DB: %s', asset.get('cacheKey'), error)
    return deleted_count


def clear_all_vbee_segment_assets():
    config = _require_r2_config()
    client = _get_r2_client()
    deleted_object_count = 0
    continuation_token = None
    while True:
        list_kwargs = {
            'Bucket': config['bucketName'],
            'Prefix': 'vbee-audio-',
        }
        if continuation_token:
            list_kwargs['ContinuationToken'] = continuation_token
        response = client.list_objects_v2(**list_kwargs)
        object_keys = [item.get('Key') for item in (response.get('Contents') or []) if item.get('Key')]
        for index in range(0, len(object_keys), 1000):
            batch = object_keys[index:index + 1000]
            if not batch:
                continue
            client.delete_objects(
                Bucket=config['bucketName'],
                Delete={'Objects': [{'Key': key} for key in batch], 'Quiet': True},
            )
            deleted_object_count += len(batch)
        if not response.get('IsTruncated'):
            break
        continuation_token = response.get('NextContinuationToken') or None

    cleared_db_counts = clear_all_vbee_request_data()
    cleared_cache_count = clear_all_vbee_cached_state()
    return {
        'deletedR2Objects': deleted_object_count,
        'deletedRedisKeys': int(cleared_cache_count or 0),
        **(cleared_db_counts or {}),
    }