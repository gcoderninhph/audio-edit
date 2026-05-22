from concurrent.futures import ThreadPoolExecutor
import re
import time
import uuid

import requests

try:
    from openai_translation_store import (
        OPENAI_REQUEST_PROVIDER,
        OpenAiTranslationValidationError,
        choose_openai_translation_token,
        get_openai_translation_config,
        touch_openai_translation_token,
    )
    from request_store import RequestStoreError, get_translation_job, save_request_record, save_translation_job
    from translation_fallback import normalize_target_language, parse_srt_entries, rebuild_srt, sanitize_file_name
except ImportError:
    from .openai_translation_store import (
        OPENAI_REQUEST_PROVIDER,
        OpenAiTranslationValidationError,
        choose_openai_translation_token,
        get_openai_translation_config,
        touch_openai_translation_token,
    )
    from .request_store import RequestStoreError, get_translation_job, save_request_record, save_translation_job
    from .translation_fallback import normalize_target_language, parse_srt_entries, rebuild_srt, sanitize_file_name


OPENAI_TRANSLATION_JOB_PREFIX = 'openai-translation-'
OPENAI_TRANSLATION_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix='openai-translation')
CODE_FENCE_PATTERN = re.compile(r'^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```$', re.DOTALL)


def is_openai_translation_job(job_id):
    return str(job_id or '').startswith(OPENAI_TRANSLATION_JOB_PREFIX)


def _resolve_chat_completions_url(api_base_url):
    normalized_base = str(api_base_url or '').strip().rstrip('/')
    if not normalized_base:
        raise OpenAiTranslationValidationError('OpenAI API base URL is not configured.')
    if normalized_base.endswith('/chat/completions'):
        return normalized_base
    if normalized_base.endswith('/v1'):
        return f'{normalized_base}/chat/completions'
    return f'{normalized_base}/v1/chat/completions'


def _build_prompt(srt_text, target_language, source_file_name, prompt_template):
    normalized_template = str(prompt_template or '').strip()
    if not normalized_template:
        normalized_template = 'Translate this subtitle file into <TARGET_LANGUAGE>. Return only valid SRT content.\n\n<SRT_FILE_CONTENT>'
    prompt_body = normalized_template.replace('<TARGET_LANGUAGE>', str(target_language or '').strip())
    if '<SRT_FILE_CONTENT>' in prompt_body:
        prompt_body = prompt_body.replace('<SRT_FILE_CONTENT>', srt_text)
    else:
        prompt_body = f'{prompt_body}\n\n<SRT_FILE_CONTENT>\n{srt_text}'
    return (
        f'Target language: {target_language}.\n'
        'Preserve subtitle order and timing alignment. Return only SRT text.\n\n'
        f'{prompt_body}'
    )


def _extract_error_message(payload, default_message):
    if isinstance(payload, dict):
        error_value = payload.get('error')
        if isinstance(error_value, dict):
            return str(error_value.get('message') or error_value.get('code') or default_message)
        if error_value:
            return str(error_value)
    return default_message


def _extract_response_text(payload):
    if not isinstance(payload, dict):
        raise RuntimeError('OpenAI returned an invalid response payload.')
    choices = payload.get('choices') or []
    if not choices:
        raise RuntimeError('OpenAI did not return any completion choices.')
    first_choice = choices[0] or {}
    message = first_choice.get('message') or {}
    content = message.get('content')
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                parts.append(str(item.get('text') or item.get('content') or ''))
            else:
                parts.append(str(item or ''))
        content = ''.join(parts)
    text = str(content or '').strip()
    if not text:
        raise RuntimeError('OpenAI did not return translated subtitle content.')
    return text


def _strip_code_fences(text):
    normalized_text = str(text or '').strip()
    match = CODE_FENCE_PATTERN.match(normalized_text)
    if match:
        return match.group(1).strip()
    return normalized_text


def _normalize_output_srt(original_entries, translated_text):
    cleaned_text = _strip_code_fences(translated_text)
    translated_entries = parse_srt_entries(cleaned_text)
    if len(translated_entries) != len(original_entries):
        raise RuntimeError('OpenAI did not return the same number of subtitle blocks as the source SRT.')
    normalized_entries = []
    for original_entry, translated_entry in zip(original_entries, translated_entries):
        normalized_entries.append({
            'timing_line': original_entry['timing_line'],
            'text': str(translated_entry.get('text') or original_entry.get('text') or '').strip() or original_entry.get('text') or '',
        })
    return rebuild_srt(normalized_entries)


def _translate_srt_with_openai(file_bytes, source_file_name, target_language, token_record, config_snapshot):
    srt_text = bytes(file_bytes or b'').decode('utf-8-sig', errors='replace')
    original_entries = parse_srt_entries(srt_text)
    if not original_entries:
        raise RuntimeError('Subtitle file is empty or not a valid SRT file.')

    response = requests.post(
        _resolve_chat_completions_url(config_snapshot.get('apiBaseUrl')),
        headers={
            'Authorization': f"Bearer {token_record.get('token') or ''}",
            'Content-Type': 'application/json',
        },
        json={
            'model': config_snapshot.get('model'),
            'temperature': config_snapshot.get('temperature'),
            'messages': [
                {'role': 'system', 'content': config_snapshot.get('systemPrompt') or ''},
                {
                    'role': 'user',
                    'content': _build_prompt(
                        srt_text,
                        target_language,
                        source_file_name,
                        config_snapshot.get('promptTemplate'),
                    ),
                },
            ],
        },
        timeout=max(10, int(config_snapshot.get('timeoutSeconds') or 120)),
    )
    payload = response.json()
    if not response.ok:
        raise RuntimeError(_extract_error_message(payload, 'OpenAI translation request failed.'))
    translated_text = _extract_response_text(payload)
    normalized_output = _normalize_output_srt(original_entries, translated_text)
    return {
        'translatedContent': normalized_output,
        'subtitleCount': len(original_entries),
        'model': config_snapshot.get('model') or '',
        'tokenId': token_record.get('id') or 0,
        'tokenName': token_record.get('name') or '',
        'sourceFileName': source_file_name,
        'targetLanguage': target_language,
    }


def _save_openai_job_state(job_id, user_id, source_file_name, target_language, output_file_name, status, created_at, details, error_message=None, output_content=None):
    updated_at = time.time()
    request_details = dict(details or {})
    if error_message:
        request_details['error'] = error_message
    else:
        request_details.pop('error', None)
    save_translation_job({
        'job_id': job_id,
        'user_id': user_id,
        'status': status,
        'error': error_message,
        'target_language': target_language,
        'output_file_name': output_file_name,
        'output_content': output_content,
        'created_at': created_at,
        'updated_at': updated_at,
    })
    save_request_record({
        'request_id': job_id,
        'user_id': user_id,
        'request_type': 'translation',
        'provider': OPENAI_REQUEST_PROVIDER,
        'status': 'success' if status == 'finished' else status,
        'source_file_name': source_file_name,
        'target_language': target_language,
        'output_file_name': output_file_name,
        'details': request_details,
        'created_at': created_at,
        'updated_at': updated_at,
    })


def _run_openai_translation_job(job_id, file_bytes, user_id, source_file_name, target_language, output_file_name, created_at, token_record, config_snapshot):
    request_details = {
        'model': config_snapshot.get('model') or '',
        'tokenId': token_record.get('id') or 0,
        'tokenName': token_record.get('name') or '',
        'promptTemplate': config_snapshot.get('promptTemplate') or '',
        'temperature': config_snapshot.get('temperature'),
        'timeoutSeconds': config_snapshot.get('timeoutSeconds'),
    }
    try:
        result = _translate_srt_with_openai(file_bytes, source_file_name, target_language, token_record, config_snapshot)
        touch_openai_translation_token(token_record.get('id'))
        _save_openai_job_state(
            job_id,
            user_id,
            source_file_name,
            target_language,
            output_file_name,
            'finished',
            created_at,
            request_details,
            output_content=result['translatedContent'],
        )
    except Exception as error:
        _save_openai_job_state(
            job_id,
            user_id,
            source_file_name,
            target_language,
            output_file_name,
            'failed',
            created_at,
            request_details,
            error_message=str(error),
        )


def create_openai_translation_job(file_bytes, original_file_name, target_language, user_id):
    try:
        normalized_target_language = normalize_target_language(target_language)
    except ValueError as error:
        raise OpenAiTranslationValidationError(str(error)) from error
    source_file_name = str(original_file_name or 'subtitles.srt').strip() or 'subtitles.srt'
    srt_text = bytes(file_bytes or b'').decode('utf-8-sig', errors='replace')
    if not parse_srt_entries(srt_text):
        raise OpenAiTranslationValidationError('Subtitle file is empty or not a valid SRT file.')

    token_record = choose_openai_translation_token()
    config_snapshot = get_openai_translation_config()
    job_id = f'{OPENAI_TRANSLATION_JOB_PREFIX}{uuid.uuid4()}'
    created_at = time.time()
    output_file_name = sanitize_file_name(f'translated_{source_file_name}')
    request_details = {
        'model': config_snapshot.get('model') or '',
        'tokenId': token_record.get('id') or 0,
        'tokenName': token_record.get('name') or '',
        'promptTemplate': config_snapshot.get('promptTemplate') or '',
        'temperature': config_snapshot.get('temperature'),
        'timeoutSeconds': config_snapshot.get('timeoutSeconds'),
    }
    _save_openai_job_state(
        job_id,
        user_id,
        source_file_name,
        normalized_target_language,
        output_file_name,
        'running',
        created_at,
        request_details,
    )
    OPENAI_TRANSLATION_EXECUTOR.submit(
        _run_openai_translation_job,
        job_id,
        bytes(file_bytes),
        user_id,
        source_file_name,
        normalized_target_language,
        output_file_name,
        created_at,
        token_record,
        config_snapshot,
    )
    return {
        'requestId': job_id,
        'outputFileName': output_file_name,
        'provider': OPENAI_REQUEST_PROVIDER,
        'model': config_snapshot.get('model') or '',
    }


def run_openai_translation_test(file_bytes, original_file_name, target_language):
    try:
        normalized_target_language = normalize_target_language(target_language)
    except ValueError as error:
        raise OpenAiTranslationValidationError(str(error)) from error

    source_file_name = str(original_file_name or 'subtitles.srt').strip() or 'subtitles.srt'
    if not source_file_name.lower().endswith('.srt'):
        raise OpenAiTranslationValidationError('Only .srt subtitle files are supported for OpenAI test translation.')

    token_record = choose_openai_translation_token()
    config_snapshot = get_openai_translation_config()
    result = _translate_srt_with_openai(file_bytes, source_file_name, normalized_target_language, token_record, config_snapshot)
    touch_openai_translation_token(token_record.get('id'))
    return {
        **result,
        'provider': OPENAI_REQUEST_PROVIDER,
        'promptTemplate': config_snapshot.get('promptTemplate') or '',
        'temperature': config_snapshot.get('temperature'),
        'timeoutSeconds': config_snapshot.get('timeoutSeconds'),
    }


def get_openai_translation_status(job_id):
    job = get_translation_job(job_id)
    if not job or not is_openai_translation_job(job_id):
        return None
    payload = {
        'jobId': job.get('job_id') or job_id,
        'status': job.get('status') or 'failed',
        'provider': OPENAI_REQUEST_PROVIDER,
    }
    if job.get('error'):
        payload['error'] = job['error']
        payload['message'] = job['error']
    return payload


def get_openai_translation_download(job_id, file_name):
    job = get_translation_job(job_id)
    if not job or not is_openai_translation_job(job_id):
        return None
    if sanitize_file_name(file_name) != sanitize_file_name(job.get('output_file_name')):
        return None
    if not job.get('output_content'):
        return None
    return {
        'output_file_name': job.get('output_file_name') or sanitize_file_name(file_name),
        'content': job.get('output_content') or '',
    }


__all__ = [
    'OPENAI_TRANSLATION_JOB_PREFIX',
    'OpenAiTranslationValidationError',
    'RequestStoreError',
    'create_openai_translation_job',
    'get_openai_translation_download',
    'get_openai_translation_status',
    'is_openai_translation_job',
    'run_openai_translation_test',
]