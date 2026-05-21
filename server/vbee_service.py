import re
from urllib.parse import urljoin

import requests

try:
    from vbee_cache import build_audio_cache_key, get_cached_audio, set_cached_audio, set_cached_request_status
    from vbee_store import (
        VBEE_STATUS_COMPLETE,
        VBEE_STATUS_FAILED,
        VBEE_STATUS_PROCESSING,
        VBEE_STATUS_QUEUED,
        VbeeNotFoundError,
        VbeeValidationError,
        create_vbee_request_record,
        get_vbee_audio_cache,
        get_vbee_config,
        get_vbee_request,
        get_vbee_segment_by_provider_request,
        get_vbee_token,
        list_active_vbee_tokens_with_capacity,
        list_processing_vbee_segments,
        list_queued_vbee_segments,
        mark_vbee_segment_processing,
        save_vbee_audio_cache,
        update_vbee_segment,
    )
except ImportError:
    from .vbee_cache import build_audio_cache_key, get_cached_audio, set_cached_audio, set_cached_request_status
    from .vbee_store import (
        VBEE_STATUS_COMPLETE,
        VBEE_STATUS_FAILED,
        VBEE_STATUS_PROCESSING,
        VBEE_STATUS_QUEUED,
        VbeeNotFoundError,
        VbeeValidationError,
        create_vbee_request_record,
        get_vbee_audio_cache,
        get_vbee_config,
        get_vbee_request,
        get_vbee_segment_by_provider_request,
        get_vbee_token,
        list_active_vbee_tokens_with_capacity,
        list_processing_vbee_segments,
        list_queued_vbee_segments,
        mark_vbee_segment_processing,
        save_vbee_audio_cache,
        update_vbee_segment,
    )


MAX_VBEE_SEGMENTS = 300
MAX_VBEE_TEXT_LENGTH = 2000


def _time_to_ms(value):
    if value in (None, ''):
        return 0
    if isinstance(value, (int, float)):
        return max(0, int(round(float(value) * 1000)))
    text = str(value).strip().replace(',', '.')
    match = re.match(r'^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$', text)
    if match:
        hours, minutes, seconds, millis = match.groups()
        return ((int(hours) * 3600 + int(minutes) * 60 + int(seconds)) * 1000) + int((millis or '0').ljust(3, '0')[:3])
    try:
        return max(0, int(round(float(text) * 1000)))
    except ValueError:
        return 0


def _subtitle_time_to_ms(subtitle, ms_key, seconds_key):
    if ms_key in subtitle:
        try:
            return max(0, int(round(float(subtitle.get(ms_key) or 0))))
        except (TypeError, ValueError):
            return _time_to_ms(subtitle.get(ms_key))
    return _time_to_ms(subtitle.get(seconds_key))


def _parse_srt(srt_text):
    subtitles = []
    blocks = re.split(r'\n\s*\n', str(srt_text or '').strip())
    for block in blocks:
        lines = [line.strip('\ufeff') for line in block.splitlines() if line.strip()]
        if len(lines) < 2:
            continue
        time_line_index = 0 if '-->' in lines[0] else 1
        if len(lines) <= time_line_index or '-->' not in lines[time_line_index]:
            continue
        start_text, end_text = [part.strip() for part in lines[time_line_index].split('-->', 1)]
        subtitles.append({
            'startMs': _time_to_ms(start_text),
            'endMs': _time_to_ms(end_text),
            'text': ' '.join(lines[time_line_index + 1:]).strip(),
        })
    return subtitles


def normalize_subtitles(subtitles):
    if not isinstance(subtitles, list) or not subtitles:
        raise VbeeValidationError('At least one subtitle segment is required.')
    if len(subtitles) > MAX_VBEE_SEGMENTS:
        raise VbeeValidationError(f'Vbee requests are limited to {MAX_VBEE_SEGMENTS} subtitle segments.')

    normalized_segments = []
    for subtitle in subtitles:
        text = ' '.join(str((subtitle or {}).get('text') or '').split())
        if not text:
            continue
        if len(text) > MAX_VBEE_TEXT_LENGTH:
            raise VbeeValidationError(f'Each Vbee segment must be under {MAX_VBEE_TEXT_LENGTH} characters.')
        normalized_segments.append({
            'text': text,
            'startMs': _subtitle_time_to_ms(subtitle, 'startMs', 'start'),
            'endMs': _subtitle_time_to_ms(subtitle, 'endMs', 'end'),
        })
    if not normalized_segments:
        raise VbeeValidationError('Subtitle text is empty.')
    return normalized_segments


def normalize_srt_subtitles(srt_text):
    return normalize_subtitles(_parse_srt(srt_text))


def _build_callback_url(config, webhook_base_url):
    configured_host = str(config.get('webhookHost') or '').strip()
    base_url = configured_host or str(webhook_base_url or '').strip()
    if not base_url:
        return ''
    if '://' not in base_url:
        base_url = f'https://{base_url}'
    return urljoin(base_url.rstrip('/') + '/', 'api/vbee/webhook')


def _provider_request_id(payload):
    if not isinstance(payload, dict):
        return ''
    candidates = [payload.get('request_id'), payload.get('requestId'), payload.get('id'), payload.get('task_id'), payload.get('taskId')]
    result = payload.get('result') if isinstance(payload.get('result'), dict) else {}
    candidates.extend([result.get('request_id'), result.get('requestId'), result.get('id'), result.get('task_id'), result.get('taskId')])
    return next((str(value) for value in candidates if value), '')


def _audio_url(payload):
    if not isinstance(payload, dict):
        return ''
    candidates = [payload.get('audio_url'), payload.get('audioUrl'), payload.get('audio_link'), payload.get('audioLink'), payload.get('download_url'), payload.get('downloadUrl'), payload.get('url')]
    result = payload.get('result') if isinstance(payload.get('result'), dict) else {}
    candidates.extend([result.get('audio_url'), result.get('audioUrl'), result.get('audio_link'), result.get('audioLink'), result.get('download_url'), result.get('downloadUrl'), result.get('url')])
    return next((str(value) for value in candidates if value), '')


def _provider_status(payload):
    if not isinstance(payload, dict):
        return ''
    result = payload.get('result') if isinstance(payload.get('result'), dict) else {}
    return str(result.get('status') or result.get('state') or payload.get('status') or payload.get('state') or '').strip().lower()


def _provider_error(payload):
    if not isinstance(payload, dict):
        return ''
    result = payload.get('result') if isinstance(payload.get('result'), dict) else {}
    return str(payload.get('message') or payload.get('error') or payload.get('error_message') or result.get('message') or result.get('error') or result.get('error_message') or '').strip()[:1000]


def _provider_api_failed(payload):
    if not isinstance(payload, dict):
        return False
    status = payload.get('status')
    return status in (0, '0', False)


def _submit_segment_to_vbee(segment, token, config, webhook_base_url):
    api_base_url = str(config.get('apiBaseUrl') or '').strip().rstrip('/')
    if not api_base_url:
        raise VbeeValidationError('Vbee API base URL is not configured')
    voice_code = segment.get('voiceCode') or config.get('defaultVoiceCode') or ''
    if not voice_code:
        raise VbeeValidationError('Vbee voice code is not configured')
    callback_url = _build_callback_url(config, webhook_base_url)
    if not callback_url:
        raise VbeeValidationError('Vbee webhook host is not configured')
    app_id = token.get('clientId') or ''
    if not app_id:
        raise VbeeValidationError('Vbee app id is not configured for this token')
    payload = {
        'app_id': app_id,
        'audio_type': config.get('audioType') or 'wav',
        'callback_url': callback_url,
        'input_text': segment.get('text') or '',
        'response_type': 'indirect',
        'voice_code': voice_code,
    }
    headers = {
        'Accept': 'application/json',
        'Authorization': f"Bearer {token.get('token') or ''}",
        'Content-Type': 'application/json',
    }
    response = requests.post(api_base_url, json=payload, headers=headers, timeout=30)
    response.raise_for_status()
    response_payload = response.json() if response.content else {}
    if _provider_api_failed(response_payload):
        raise RuntimeError(_provider_error(response_payload) or 'Vbee rejected the request')
    provider_request_id = _provider_request_id(response_payload) or str(segment.get('id'))
    audio_url = _audio_url(response_payload)
    status = _provider_status(response_payload)
    if audio_url or status in {'success', 'complete', 'completed', 'done'}:
        return {'state': VBEE_STATUS_COMPLETE, 'providerRequestId': provider_request_id, 'audioUrl': audio_url, 'raw': response_payload}
    if status in {'failure', 'failed', 'fail', 'error'}:
        return {'state': VBEE_STATUS_FAILED, 'providerRequestId': provider_request_id, 'errorMessage': _provider_error(response_payload), 'raw': response_payload}
    return {'state': VBEE_STATUS_PROCESSING, 'providerRequestId': provider_request_id, 'raw': response_payload}


def _fetch_segment_from_vbee(segment, token, config):
    api_base_url = str(config.get('apiBaseUrl') or '').strip().rstrip('/')
    provider_request_id = segment.get('providerRequestId') or ''
    if not api_base_url or not provider_request_id:
        return None
    headers = {
        'Accept': 'application/json',
        'Authorization': f"Bearer {token.get('token') or ''}",
        'Content-Type': 'application/json',
    }
    response = requests.get(f'{api_base_url}/{provider_request_id}', headers=headers, timeout=20)
    response.raise_for_status()
    payload = response.json() if response.content else {}
    if _provider_api_failed(payload):
        return {'state': VBEE_STATUS_FAILED, 'errorMessage': _provider_error(payload) or 'Vbee request lookup failed', 'raw': payload}
    provider_status = _provider_status(payload)
    audio_url = _audio_url(payload)
    if audio_url:
        return {'state': VBEE_STATUS_COMPLETE, 'audioUrl': audio_url, 'raw': payload}
    if provider_status in {'failure', 'failed', 'fail', 'error'}:
        return {'state': VBEE_STATUS_FAILED, 'errorMessage': _provider_error(payload) or 'Vbee request failed', 'raw': payload}
    return {'state': VBEE_STATUS_PROCESSING, 'raw': payload}


def _cache_payload_for_segment(segment, audio_url):
    return {
        'audioUrl': audio_url,
        'characterCount': int(segment.get('characterCount') or len(segment.get('text') or '')),
        'providerRequestId': segment.get('providerRequestId') or '',
    }


def create_voiceover_request(user_id, subtitles, language='', voice_code='', webhook_base_url=''):
    config = get_vbee_config()
    safe_language = str(language or config.get('defaultLanguage') or 'vi').strip()[:32]
    safe_voice_code = str(voice_code or config.get('defaultVoiceCode') or '').strip()[:80]
    segments = []
    for subtitle in normalize_subtitles(subtitles):
        cache_key = build_audio_cache_key(subtitle['text'], safe_voice_code, safe_language)
        cached_audio = get_cached_audio(cache_key) or get_vbee_audio_cache(cache_key)
        segment = {
            **subtitle,
            'cacheKey': cache_key,
            'characterCount': len(subtitle['text']),
            'status': VBEE_STATUS_QUEUED,
        }
        if cached_audio and cached_audio.get('audioUrl'):
            segment.update({
                'audioUrl': cached_audio['audioUrl'],
                'providerRequestId': cached_audio.get('providerRequestId') or '',
                'status': VBEE_STATUS_COMPLETE,
            })
        segments.append(segment)
    request_record = create_vbee_request_record(
        user_id,
        safe_language,
        safe_voice_code,
        {'source': 'client', 'subtitleCount': len(segments)},
        segments,
    )
    dispatch_queued_vbee_segments(webhook_base_url=webhook_base_url)
    return get_voiceover_request_status(request_record['requestId'], user_id=user_id)


def get_voiceover_request_status(request_id, user_id=None):
    dispatch_queued_vbee_segments()
    refresh_processing_vbee_segments()
    request_record = get_vbee_request(request_id, user_id=user_id)
    set_cached_request_status(request_id, request_record)
    return request_record


def dispatch_queued_vbee_segments(limit=50, webhook_base_url=''):
    config = get_vbee_config()
    tokens = list_active_vbee_tokens_with_capacity()
    if not tokens:
        return {'dispatched': 0, 'reason': 'no-active-token'}
    queued_segments = list_queued_vbee_segments(limit=limit)
    dispatched = 0
    token_index = 0
    for segment in queued_segments:
        token = None
        while token_index < len(tokens):
            candidate = tokens[token_index]
            if int(candidate.get('availableCapacity') or 0) > 0:
                token = candidate
                candidate['availableCapacity'] -= 1
                break
            token_index += 1
        if not token:
            break
        try:
            submit_result = _submit_segment_to_vbee(segment, token, config, webhook_base_url)
        except Exception as error:
            update_vbee_segment(segment['id'], status=VBEE_STATUS_FAILED, token_id=token['id'], error_message=str(error)[:1000])
            continue

        provider_request_id = submit_result.get('providerRequestId') or str(segment['id'])
        if submit_result.get('state') == VBEE_STATUS_COMPLETE:
            audio_url = submit_result.get('audioUrl') or ''
            request_record = update_vbee_segment(segment['id'], status=VBEE_STATUS_COMPLETE, token_id=token['id'], provider_request_id=provider_request_id, audio_url=audio_url)
            if audio_url:
                save_vbee_audio_cache(segment['cacheKey'], segment.get('language') or '', segment.get('voiceCode') or '', audio_url, provider_request_id, segment.get('characterCount'))
                set_cached_audio(segment['cacheKey'], _cache_payload_for_segment({**segment, 'providerRequestId': provider_request_id}, audio_url))
            if request_record:
                set_cached_request_status(request_record['requestId'], request_record)
        elif submit_result.get('state') == VBEE_STATUS_FAILED:
            request_record = update_vbee_segment(segment['id'], status=VBEE_STATUS_FAILED, token_id=token['id'], provider_request_id=provider_request_id, error_message=submit_result.get('errorMessage') or 'Vbee request failed')
            if request_record:
                set_cached_request_status(request_record['requestId'], request_record)
        elif submit_result.get('state') == 'queued':
            break
        else:
            request_record = mark_vbee_segment_processing(segment['id'], token['id'], provider_request_id)
            if request_record:
                set_cached_request_status(request_record['requestId'], request_record)
        dispatched += 1
    return {'dispatched': dispatched}


def refresh_processing_vbee_segments(limit=50):
    config = get_vbee_config()
    for segment in list_processing_vbee_segments(limit=limit):
        try:
            token = get_vbee_token(segment.get('tokenId'), include_secret=True)
            if not token:
                continue
            result = _fetch_segment_from_vbee(segment, token, config)
            if not result:
                continue
            if result.get('state') == VBEE_STATUS_COMPLETE:
                audio_url = result.get('audioUrl') or ''
                request_record = update_vbee_segment(segment['id'], status=VBEE_STATUS_COMPLETE, audio_url=audio_url)
                if audio_url:
                    save_vbee_audio_cache(segment['cacheKey'], segment.get('language') or '', segment.get('voiceCode') or '', audio_url, segment.get('providerRequestId') or '', segment.get('characterCount'))
                    set_cached_audio(segment['cacheKey'], _cache_payload_for_segment(segment, audio_url))
            elif result.get('state') == VBEE_STATUS_FAILED:
                request_record = update_vbee_segment(segment['id'], status=VBEE_STATUS_FAILED, error_message=result.get('errorMessage') or 'Vbee request failed')
            else:
                request_record = update_vbee_segment(segment['id'], status=VBEE_STATUS_PROCESSING)
            if request_record:
                set_cached_request_status(request_record['requestId'], request_record)
        except Exception:
            continue


def apply_vbee_webhook(payload):
    provider_request_id = _provider_request_id(payload) or str(payload.get('client_request_id') or payload.get('clientRequestId') or '')
    if not provider_request_id:
        raise VbeeValidationError('Webhook payload does not include a request id.')
    segment = get_vbee_segment_by_provider_request(provider_request_id)
    audio_url = _audio_url(payload)
    status = _provider_status(payload)
    if audio_url or status in {'success', 'complete', 'completed', 'done'}:
        request_record = update_vbee_segment(segment['id'], status=VBEE_STATUS_COMPLETE, audio_url=audio_url, provider_request_id=provider_request_id)
        if audio_url:
            save_vbee_audio_cache(segment['cacheKey'], segment.get('language') or '', segment.get('voiceCode') or '', audio_url, provider_request_id, segment.get('characterCount'))
            set_cached_audio(segment['cacheKey'], _cache_payload_for_segment(segment, audio_url))
    elif status in {'failure', 'failed', 'fail', 'error', 'canceled', 'cancelled'}:
        request_record = update_vbee_segment(segment['id'], status=VBEE_STATUS_FAILED, provider_request_id=provider_request_id, error_message=_provider_error(payload) or 'Vbee request failed')
    else:
        request_record = update_vbee_segment(segment['id'], provider_request_id=provider_request_id)
    dispatch_queued_vbee_segments()
    if request_record:
        set_cached_request_status(request_record['requestId'], request_record)
    return request_record