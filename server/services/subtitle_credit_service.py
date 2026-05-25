import math
import re

try:
    from services.openai_translation_store import get_openai_translation_config
    from services.translation_fallback import parse_srt_entries
    from services.whisper_admin_store import get_whisper_service_config
except ImportError:
    from .openai_translation_store import get_openai_translation_config
    from .translation_fallback import parse_srt_entries
    from .whisper_admin_store import get_whisper_service_config


DEFAULT_TRANSCRIPTION_CREDIT_COST = 20


def _safe_rate(value):
    try:
        return max(0.0, float(value))
    except (TypeError, ValueError):
        return 0.0


def _decode_srt(file_bytes):
    return bytes(file_bytes or b'').decode('utf-8-sig', errors='ignore')


def count_srt_text_words(file_bytes):
    srt_text = _decode_srt(file_bytes)
    subtitle_text = '\n'.join(entry.get('text') or '' for entry in parse_srt_entries(srt_text))
    return count_subtitle_text_words([subtitle_text])


def count_subtitle_text_words(text_values):
    subtitle_text = '\n'.join(str(text or '') for text in (text_values or []))
    subtitle_text = re.sub(r'<[^>]+>', ' ', subtitle_text)
    return len(re.findall(r'\b\w+\b', subtitle_text, flags=re.UNICODE))


def _calculate_translation_credit_for_word_count(word_count):
    config = get_openai_translation_config()
    credit_per_word = _safe_rate(config.get('creditPerWord'))
    credit_cost = int(math.ceil(word_count * credit_per_word)) if word_count > 0 and credit_per_word > 0 else 0
    return {
        'creditCost': max(0, credit_cost),
        'creditPerWord': credit_per_word,
        'wordCount': word_count,
    }


def calculate_translation_credit(file_bytes):
    word_count = count_srt_text_words(file_bytes)
    return _calculate_translation_credit_for_word_count(word_count)


def calculate_translation_credit_from_subtitles(subtitles):
    safe_subtitles = subtitles if isinstance(subtitles, list) else []
    word_count = count_subtitle_text_words([subtitle.get('text') for subtitle in safe_subtitles if isinstance(subtitle, dict)])
    return _calculate_translation_credit_for_word_count(word_count)


def calculate_transcription_credit(duration_seconds=None):
    if duration_seconds is None or str(duration_seconds).strip() == '':
        return {
            'creditCost': DEFAULT_TRANSCRIPTION_CREDIT_COST,
            'creditPerMinute': DEFAULT_TRANSCRIPTION_CREDIT_COST,
            'durationMinutes': 1,
            'durationSeconds': 0,
            'usedFallback': True,
        }

    try:
        safe_duration_seconds = max(0.0, float(duration_seconds))
    except (TypeError, ValueError):
        safe_duration_seconds = 0.0
    config = get_whisper_service_config()
    credit_per_minute = _safe_rate(config.get('detectCreditPerMinute'))
    duration_minutes = int(math.floor(safe_duration_seconds / 60.0))
    credit_cost = int(math.ceil(duration_minutes * credit_per_minute)) if duration_minutes > 0 and credit_per_minute > 0 else 0
    return {
        'creditCost': max(0, credit_cost),
        'creditPerMinute': credit_per_minute,
        'durationMinutes': duration_minutes,
        'durationSeconds': safe_duration_seconds,
        'usedFallback': False,
    }


def calculate_create_sub_credit(duration_seconds=None, origin_subtitles=None):
    has_cached_origin = isinstance(origin_subtitles, list) and any(
        isinstance(subtitle, dict) and str(subtitle.get('text') or '').strip()
        for subtitle in origin_subtitles
    )
    transcription_credit = {
        'creditCost': 0,
        'creditPerMinute': 0,
        'durationMinutes': 0,
        'durationSeconds': 0,
        'usedFallback': False,
    } if has_cached_origin else calculate_transcription_credit(duration_seconds)
    translation_credit = calculate_translation_credit_from_subtitles(origin_subtitles) if has_cached_origin else None
    credit_cost = int(transcription_credit.get('creditCost') or 0) + int((translation_credit or {}).get('creditCost') or 0)
    return {
        'creditCost': max(0, credit_cost),
        'hasCachedOrigin': has_cached_origin,
        'isComplete': has_cached_origin,
        'pendingTranslationCredit': not has_cached_origin,
        'transcription': transcription_credit,
        'translation': translation_credit,
    }