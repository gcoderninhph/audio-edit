from concurrent.futures import ThreadPoolExecutor
import time
import re
import uuid

try:
    from openai_translation_client import prepare_openai_request_context, translate_srt_with_openai
    from openai_translation_store import (
        OPENAI_REQUEST_PROVIDER,
        OpenAiTranslationValidationError,
        choose_openai_translation_token,
        get_openai_translation_config,
        touch_openai_translation_token,
    )
    from request_store import RequestStoreError, get_translation_job, save_request_record, save_translation_job
    from translation_fallback import sanitize_file_name
except ImportError:
    from .openai_translation_client import prepare_openai_request_context, translate_srt_with_openai
    from .openai_translation_store import (
        OPENAI_REQUEST_PROVIDER,
        OpenAiTranslationValidationError,
        choose_openai_translation_token,
        get_openai_translation_config,
        touch_openai_translation_token,
    )
    from .request_store import RequestStoreError, get_translation_job, save_request_record, save_translation_job
    from .translation_fallback import sanitize_file_name


OPENAI_TRANSLATION_JOB_PREFIX = 'openai-translation-'
OPENAI_TRANSLATION_TEST_REQUEST_PREFIX = 'openai-test-'
OPENAI_TRANSLATION_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix='openai-translation')
OPENAI_TARGET_LANGUAGE_ALIASES = {
    'vi': 'Vietnamese',
    'vietnamese': 'Vietnamese',
    'en': 'English',
    'english': 'English',
    'es': 'Spanish',
    'spanish': 'Spanish',
    'fr': 'French',
    'french': 'French',
    'de': 'German',
    'german': 'German',
    'it': 'Italian',
    'italian': 'Italian',
    'pt': 'Portuguese',
    'portuguese': 'Portuguese',
    'ru': 'Russian',
    'russian': 'Russian',
    'zh': 'Chinese',
    'zh-cn': 'Chinese',
    'chinese': 'Chinese',
    'ja': 'Japanese',
    'japanese': 'Japanese',
    'ko': 'Korean',
    'korean': 'Korean',
    'th': 'Thai',
    'thai': 'Thai',
    'id': 'Indonesian',
    'indonesian': 'Indonesian',
    'ms': 'Malay',
    'malay': 'Malay',
    'fil': 'Filipino',
    'tl': 'Filipino',
    'filipino': 'Filipino',
    'hi': 'Hindi',
    'hindi': 'Hindi',
    'ar': 'Arabic',
    'arabic': 'Arabic',
    'bn': 'Bengali',
    'bengali': 'Bengali',
    'tr': 'Turkish',
    'turkish': 'Turkish',
    'nl': 'Dutch',
    'dutch': 'Dutch',
    'pl': 'Polish',
    'polish': 'Polish',
    'uk': 'Ukrainian',
    'ukrainian': 'Ukrainian',
    'ro': 'Romanian',
    'romanian': 'Romanian',
    'cs': 'Czech',
    'czech': 'Czech',
    'el': 'Greek',
    'greek': 'Greek',
    'he': 'Hebrew',
    'iw': 'Hebrew',
    'hebrew': 'Hebrew',
    'sv': 'Swedish',
    'swedish': 'Swedish',
    'da': 'Danish',
    'danish': 'Danish',
    'no': 'Norwegian',
    'nb': 'Norwegian',
    'norwegian': 'Norwegian',
    'fi': 'Finnish',
    'finnish': 'Finnish',
}


def normalize_openai_target_language(target_language):
    normalized = re.sub(r'\s+', ' ', str(target_language or '').strip())
    if not normalized:
        raise OpenAiTranslationValidationError('Target language is required.')

    canonical_language = OPENAI_TARGET_LANGUAGE_ALIASES.get(normalized.lower())
    if canonical_language:
        return canonical_language

    if re.fullmatch(r"[A-Za-z][A-Za-z\s()'/-]{1,63}", normalized):
        return normalized

    raise OpenAiTranslationValidationError(f'Unsupported target language: {target_language}')


def is_openai_translation_job(job_id):
    return str(job_id or '').startswith(OPENAI_TRANSLATION_JOB_PREFIX)


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


def _save_openai_test_request_state(request_id, user_id, source_file_name, target_language, output_file_name, status, created_at, details, error_message=None):
    updated_at = time.time()
    request_details = dict(details or {})
    request_details['requestMode'] = 'admin-test'
    if error_message:
        request_details['error'] = error_message
    else:
        request_details.pop('error', None)
    save_request_record({
        'request_id': request_id,
        'user_id': user_id,
        'request_type': 'translation',
        'provider': OPENAI_REQUEST_PROVIDER,
        'status': status,
        'source_file_name': source_file_name,
        'target_language': target_language,
        'output_file_name': output_file_name,
        'details': request_details,
        'created_at': created_at,
        'updated_at': updated_at,
    })


def _build_openai_request_details(config_snapshot=None, token_record=None, request_context=None, result=None):
    usage_source = result or {}
    prepared_context = request_context or {}
    return {
        'model': (config_snapshot or {}).get('model') or '',
        'tokenId': (token_record or {}).get('id') or 0,
        'tokenName': (token_record or {}).get('name') or '',
        'userPrompt': str(usage_source.get('userPrompt') or prepared_context.get('userPrompt') or ''),
        'inputTokens': usage_source.get('inputTokens'),
        'outputTokens': usage_source.get('outputTokens'),
        'totalTokens': usage_source.get('totalTokens'),
        'temperature': (config_snapshot or {}).get('temperature'),
        'timeoutSeconds': (config_snapshot or {}).get('timeoutSeconds'),
    }


def _run_openai_translation_job(job_id, file_bytes, user_id, source_file_name, target_language, output_file_name, created_at, token_record, config_snapshot):
    request_context = None
    request_details = _build_openai_request_details(config_snapshot, token_record)
    try:
        request_context = prepare_openai_request_context(file_bytes, source_file_name, target_language, config_snapshot)
        request_details = _build_openai_request_details(config_snapshot, token_record, request_context=request_context)
        result = translate_srt_with_openai(
            file_bytes,
            source_file_name,
            target_language,
            token_record,
            config_snapshot,
            request_context=request_context,
        )
        touch_openai_translation_token(token_record.get('id'))
        _save_openai_job_state(
            job_id,
            user_id,
            source_file_name,
            target_language,
            output_file_name,
            'finished',
            created_at,
            _build_openai_request_details(config_snapshot, token_record, request_context=request_context, result=result),
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
        normalized_target_language = normalize_openai_target_language(target_language)
    except OpenAiTranslationValidationError:
        raise
    source_file_name = str(original_file_name or 'subtitles.srt').strip() or 'subtitles.srt'
    token_record = choose_openai_translation_token()
    config_snapshot = get_openai_translation_config()
    job_id = f'{OPENAI_TRANSLATION_JOB_PREFIX}{uuid.uuid4()}'
    created_at = time.time()
    output_file_name = sanitize_file_name(f'translated_{source_file_name}')
    try:
        request_context = prepare_openai_request_context(file_bytes, source_file_name, normalized_target_language, config_snapshot)
    except RuntimeError as error:
        raise OpenAiTranslationValidationError(str(error)) from error
    request_details = _build_openai_request_details(config_snapshot, token_record, request_context=request_context)
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


def run_openai_translation_test(file_bytes, original_file_name, target_language, user_id=''):
    request_id = f'{OPENAI_TRANSLATION_TEST_REQUEST_PREFIX}{uuid.uuid4()}'
    created_at = time.time()
    source_file_name = str(original_file_name or 'subtitles.srt').strip() or 'subtitles.srt'
    output_file_name = sanitize_file_name(f'test_translated_{source_file_name}')
    raw_target_language = str(target_language or '').strip()
    try:
        normalized_target_language = normalize_openai_target_language(target_language)
    except OpenAiTranslationValidationError as error:
        _save_openai_test_request_state(
            request_id,
            user_id,
            source_file_name,
            raw_target_language,
            output_file_name,
            'failed',
            created_at,
            {},
            error_message=str(error),
        )
        raise OpenAiTranslationValidationError(str(error)) from error

    if not source_file_name.lower().endswith('.srt'):
        _save_openai_test_request_state(
            request_id,
            user_id,
            source_file_name,
            normalized_target_language,
            output_file_name,
            'failed',
            created_at,
            {},
            error_message='Only .srt subtitle files are supported for OpenAI test translation.',
        )
        raise OpenAiTranslationValidationError('Only .srt subtitle files are supported for OpenAI test translation.')

    token_record = None
    config_snapshot = None
    request_context = None
    try:
        token_record = choose_openai_translation_token()
        config_snapshot = get_openai_translation_config()
        try:
            request_context = prepare_openai_request_context(file_bytes, source_file_name, normalized_target_language, config_snapshot)
        except RuntimeError as error:
            raise OpenAiTranslationValidationError(str(error)) from error
        request_details = _build_openai_request_details(config_snapshot, token_record, request_context=request_context)
        result = translate_srt_with_openai(
            file_bytes,
            source_file_name,
            normalized_target_language,
            token_record,
            config_snapshot,
            request_context=request_context,
        )
        touch_openai_translation_token(token_record.get('id'))
        _save_openai_test_request_state(
            request_id,
            user_id,
            source_file_name,
            normalized_target_language,
            output_file_name,
            'success',
            created_at,
            _build_openai_request_details(config_snapshot, token_record, request_context=request_context, result=result),
        )
        return {
            **result,
            'requestId': request_id,
            'provider': OPENAI_REQUEST_PROVIDER,
            'promptTemplate': config_snapshot.get('promptTemplate') or '',
            'temperature': config_snapshot.get('temperature'),
            'timeoutSeconds': config_snapshot.get('timeoutSeconds'),
        }
    except Exception as error:
        _save_openai_test_request_state(
            request_id,
            user_id,
            source_file_name,
            normalized_target_language,
            output_file_name,
            'failed',
            created_at,
            _build_openai_request_details(config_snapshot, token_record, request_context=request_context),
            error_message=str(error),
        )
        raise


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