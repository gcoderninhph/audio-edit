import re

import requests

try:
    from openai_translation_store import OpenAiTranslationValidationError
    from translation_fallback import parse_srt_entries, rebuild_srt
except ImportError:
    from .openai_translation_store import OpenAiTranslationValidationError
    from .translation_fallback import parse_srt_entries, rebuild_srt


CODE_FENCE_PATTERN = re.compile(r'^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```$', re.DOTALL)


def resolve_chat_completions_url(api_base_url):
    normalized_base = str(api_base_url or '').strip().rstrip('/')
    if not normalized_base:
        raise OpenAiTranslationValidationError('OpenAI API base URL is not configured.')
    if normalized_base.endswith('/chat/completions'):
        return normalized_base
    if normalized_base.endswith('/v1'):
        return f'{normalized_base}/chat/completions'
    return f'{normalized_base}/v1/chat/completions'


def build_prompt(srt_text, target_language, source_file_name, prompt_template):
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


def extract_error_message(payload, default_message):
    if isinstance(payload, dict):
        error_value = payload.get('error')
        if isinstance(error_value, dict):
            return str(error_value.get('message') or error_value.get('code') or default_message)
        if error_value:
            return str(error_value)
    return default_message


def extract_response_text(payload):
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


def strip_code_fences(text):
    normalized_text = str(text or '').strip()
    match = CODE_FENCE_PATTERN.match(normalized_text)
    if match:
        return match.group(1).strip()
    return normalized_text


def normalize_output_srt(original_entries, translated_text):
    cleaned_text = strip_code_fences(translated_text)
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


def prepare_openai_request_context(file_bytes, source_file_name, target_language, config_snapshot):
    srt_text = bytes(file_bytes or b'').decode('utf-8-sig', errors='replace')
    original_entries = parse_srt_entries(srt_text)
    if not original_entries:
        raise RuntimeError('Subtitle file is empty or not a valid SRT file.')
    return {
        'originalEntries': original_entries,
        'systemPrompt': str((config_snapshot or {}).get('systemPrompt') or ''),
        'userPrompt': build_prompt(
            srt_text,
            target_language,
            source_file_name,
            (config_snapshot or {}).get('promptTemplate'),
        ),
    }


def _safe_token_usage_value(value):
    if value is None or value == '':
        return None
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return None


def extract_token_usage(payload):
    usage = payload.get('usage') if isinstance(payload, dict) else {}
    if not isinstance(usage, dict):
        usage = {}
    input_tokens = _safe_token_usage_value(usage.get('prompt_tokens'))
    if input_tokens is None:
        input_tokens = _safe_token_usage_value(usage.get('input_tokens'))
    output_tokens = _safe_token_usage_value(usage.get('completion_tokens'))
    if output_tokens is None:
        output_tokens = _safe_token_usage_value(usage.get('output_tokens'))
    total_tokens = _safe_token_usage_value(usage.get('total_tokens'))
    if total_tokens is None and (input_tokens is not None or output_tokens is not None):
        total_tokens = int(input_tokens or 0) + int(output_tokens or 0)
    return {
        'inputTokens': input_tokens,
        'outputTokens': output_tokens,
        'totalTokens': total_tokens,
    }


def translate_srt_with_openai(file_bytes, source_file_name, target_language, token_record, config_snapshot, request_context=None):
    prepared_context = request_context or prepare_openai_request_context(
        file_bytes,
        source_file_name,
        target_language,
        config_snapshot,
    )
    response = requests.post(
        resolve_chat_completions_url(config_snapshot.get('apiBaseUrl')),
        headers={
            'Authorization': f"Bearer {token_record.get('token') or ''}",
            'Content-Type': 'application/json',
        },
        json={
            'model': config_snapshot.get('model'),
            'temperature': config_snapshot.get('temperature'),
            'messages': [
                {'role': 'system', 'content': prepared_context['systemPrompt']},
                {'role': 'user', 'content': prepared_context['userPrompt']},
            ],
        },
        timeout=max(10, int(config_snapshot.get('timeoutSeconds') or 120)),
    )
    payload = response.json()
    if not response.ok:
        raise RuntimeError(extract_error_message(payload, 'OpenAI translation request failed.'))
    translated_text = extract_response_text(payload)
    usage = extract_token_usage(payload)
    return {
        'translatedContent': normalize_output_srt(prepared_context['originalEntries'], translated_text),
        'subtitleCount': len(prepared_context['originalEntries']),
        'model': config_snapshot.get('model') or '',
        'tokenId': token_record.get('id') or 0,
        'tokenName': token_record.get('name') or '',
        'sourceFileName': source_file_name,
        'targetLanguage': target_language,
        'userPrompt': prepared_context['userPrompt'],
        **usage,
    }


__all__ = [
    'prepare_openai_request_context',
    'translate_srt_with_openai',
]