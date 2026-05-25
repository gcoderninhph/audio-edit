import math

try:
    from services.vbee_asset_service import has_reusable_vbee_segment_asset
    from services.vbee_cache import build_audio_cache_key
    from services.vbee_service import normalize_subtitles
    from services.vbee_token_store import DEFAULT_VBEE_CACHED_CREDIT_PER_CHARACTER, DEFAULT_VBEE_CREDIT_PER_CHARACTER, get_vbee_config
    from utils.vbee_schema import VbeeValidationError
    from utils.vbee_voice_catalog import get_vbee_language_label, normalize_vbee_enabled_language_codes, normalize_vbee_language_code
except ImportError:
    from .vbee_asset_service import has_reusable_vbee_segment_asset
    from .vbee_cache import build_audio_cache_key
    from .vbee_service import normalize_subtitles
    from .vbee_token_store import DEFAULT_VBEE_CACHED_CREDIT_PER_CHARACTER, DEFAULT_VBEE_CREDIT_PER_CHARACTER, get_vbee_config
    from ..utils.vbee_schema import VbeeValidationError
    from ..utils.vbee_voice_catalog import get_vbee_language_label, normalize_vbee_enabled_language_codes, normalize_vbee_language_code


def _credit_rate(config, key, default_value):
    try:
        return max(0.0, float(config.get(key, default_value)))
    except (TypeError, ValueError):
        return float(default_value)


def _resolve_vbee_credit_context(language='', voice_code=''):
    config = get_vbee_config()
    try:
        safe_language = normalize_vbee_language_code(language or config.get('defaultLanguage') or 'vi')[:32]
    except ValueError as error:
        raise VbeeValidationError(str(error)) from error

    enabled_language_codes = normalize_vbee_enabled_language_codes(config.get('enabledLanguageCodes'), allow_empty=True)
    if safe_language not in enabled_language_codes:
        raise VbeeValidationError(f'Voiceover is disabled for {get_vbee_language_label(safe_language)}.')

    try:
        configured_default_language = normalize_vbee_language_code(config.get('defaultLanguage') or safe_language)
    except ValueError:
        configured_default_language = safe_language

    configured_default_voice_code = str(config.get('defaultVoiceCode') or '').strip()[:80]
    safe_voice_code = str(voice_code or '').strip()[:80]
    cache_voice_code = safe_voice_code or (configured_default_voice_code if safe_language == configured_default_language else '')
    return config, safe_language, safe_voice_code, cache_voice_code


def estimate_voiceover_credit_cost(subtitles, language='', voice_code=''):
    config, safe_language, safe_voice_code, cache_voice_code = _resolve_vbee_credit_context(language, voice_code)
    credit_per_character = _credit_rate(config, 'creditPerCharacter', DEFAULT_VBEE_CREDIT_PER_CHARACTER)
    cached_credit_per_character = _credit_rate(config, 'cachedCreditPerCharacter', DEFAULT_VBEE_CACHED_CREDIT_PER_CHARACTER)

    total_characters = 0
    cached_characters = 0
    cached_segments = 0
    uncached_segments = 0
    cache_hits = {}

    normalized_subtitles = normalize_subtitles(subtitles)
    for subtitle in normalized_subtitles:
        character_count = len(subtitle['text'])
        total_characters += character_count
        cache_key = build_audio_cache_key(subtitle['text'], cache_voice_code, safe_language)
        if cache_key not in cache_hits:
            cache_hits[cache_key] = has_reusable_vbee_segment_asset(cache_key, allow_backfill=True)
        if cache_hits[cache_key]:
            cached_characters += character_count
            cached_segments += 1
        else:
            uncached_segments += 1

    uncached_characters = max(0, total_characters - cached_characters)
    raw_credit_cost = (uncached_characters * credit_per_character) + (cached_characters * cached_credit_per_character)
    return {
        'cachedCharacters': cached_characters,
        'cachedCreditPerCharacter': cached_credit_per_character,
        'cachedSegments': cached_segments,
        'creditCost': int(math.ceil(max(0.0, raw_credit_cost))),
        'creditPerCharacter': credit_per_character,
        'language': safe_language,
        'rawCreditCost': raw_credit_cost,
        'totalCharacters': total_characters,
        'totalSegments': len(normalized_subtitles),
        'uncachedCharacters': uncached_characters,
        'uncachedSegments': uncached_segments,
        'voiceCode': safe_voice_code,
    }