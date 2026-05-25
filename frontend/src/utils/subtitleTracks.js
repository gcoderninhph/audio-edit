const BUILTIN_SUBTITLE_LANGUAGE_OPTIONS = Object.freeze([
  { id: 'original', label: 'Original', source: 'original', translatable: false, voiceoverCode: '' },
  { id: 'vietnamese', label: 'Vietnamese', source: 'translation', translatable: true, voiceoverCode: 'vi' },
  { id: 'english', label: 'English', source: 'translation', translatable: true, voiceoverCode: 'en' },
  { id: 'spanish', label: 'Spanish', source: 'translation', translatable: true, voiceoverCode: 'es' },
  { id: 'french', label: 'French', source: 'translation', translatable: true, voiceoverCode: 'fr' },
  { id: 'german', label: 'German', source: 'translation', translatable: true, voiceoverCode: 'de' },
  { id: 'italian', label: 'Italian', source: 'translation', translatable: true, voiceoverCode: 'it' },
  { id: 'portuguese', label: 'Portuguese', source: 'translation', translatable: true, voiceoverCode: 'pt' },
  { id: 'russian', label: 'Russian', source: 'translation', translatable: true, voiceoverCode: 'ru' },
  { id: 'chinese', label: 'Chinese', source: 'translation', translatable: true, voiceoverCode: 'zh' },
  { id: 'japanese', label: 'Japanese', source: 'translation', translatable: true, voiceoverCode: 'ja' },
  { id: 'korean', label: 'Korean', source: 'translation', translatable: true, voiceoverCode: 'ko' },
  { id: 'thai', label: 'Thai', source: 'translation', translatable: true, voiceoverCode: 'th' },
  { id: 'indonesian', label: 'Indonesian', source: 'translation', translatable: true, voiceoverCode: 'id' },
  { id: 'malay', label: 'Malay', source: 'translation', translatable: true, voiceoverCode: 'ms' },
  { id: 'filipino', label: 'Filipino', source: 'translation', translatable: true, voiceoverCode: 'fil' },
  { id: 'hindi', label: 'Hindi', source: 'translation', translatable: true, voiceoverCode: 'hi' },
  { id: 'arabic', label: 'Arabic', source: 'translation', translatable: true, voiceoverCode: 'ar' },
  { id: 'bengali', label: 'Bengali', source: 'translation', translatable: true, voiceoverCode: 'bn' },
  { id: 'turkish', label: 'Turkish', source: 'translation', translatable: true, voiceoverCode: 'tr' },
  { id: 'dutch', label: 'Dutch', source: 'translation', translatable: true, voiceoverCode: 'nl' },
  { id: 'polish', label: 'Polish', source: 'translation', translatable: true, voiceoverCode: 'pl' },
  { id: 'ukrainian', label: 'Ukrainian', source: 'translation', translatable: true, voiceoverCode: 'uk' },
  { id: 'romanian', label: 'Romanian', source: 'translation', translatable: true, voiceoverCode: 'ro' },
  { id: 'czech', label: 'Czech', source: 'translation', translatable: true, voiceoverCode: 'cs' },
  { id: 'greek', label: 'Greek', source: 'translation', translatable: true, voiceoverCode: 'el' },
  { id: 'hebrew', label: 'Hebrew', source: 'translation', translatable: true, voiceoverCode: 'he' },
  { id: 'swedish', label: 'Swedish', source: 'translation', translatable: true, voiceoverCode: 'sv' },
  { id: 'danish', label: 'Danish', source: 'translation', translatable: true, voiceoverCode: 'da' },
  { id: 'norwegian', label: 'Norwegian', source: 'translation', translatable: true, voiceoverCode: 'no' },
  { id: 'finnish', label: 'Finnish', source: 'translation', translatable: true, voiceoverCode: 'fi' },
])

export const DEFAULT_SUBTITLE_LANGUAGE_KEY = 'original'
export const DEFAULT_TRANSLATION_LANGUAGE_KEY = 'vietnamese'
export const DEFAULT_VOICEOVER_LANGUAGE_KEY = DEFAULT_TRANSLATION_LANGUAGE_KEY

const LANGUAGE_KEY_ALIASES = BUILTIN_SUBTITLE_LANGUAGE_OPTIONS.reduce((aliases, option) => {
  aliases.set(option.id, option.id)
  aliases.set(option.label.toLowerCase(), option.id)
  if (option.voiceoverCode) {
    aliases.set(option.voiceoverCode.toLowerCase(), option.id)
  }
  return aliases
}, new Map())

function getBuiltinSubtitleLanguageOption(languageKey) {
  const normalizedLanguageKey = normalizeSubtitleLanguageKey(languageKey)
  return BUILTIN_SUBTITLE_LANGUAGE_OPTIONS.find((option) => option.id === normalizedLanguageKey) || null
}

function buildFallbackSubtitleLanguageLabel(languageKey) {
  return String(languageKey || '')
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ') || 'Original'
}

function normalizeSubtitleArray(subtitles) {
  if (!Array.isArray(subtitles)) {
    return []
  }

  return subtitles
    .filter(Boolean)
    .map((subtitle, index) => ({
      ...subtitle,
      end: Number.isFinite(subtitle?.end) ? subtitle.end : Number(subtitle?.end) || 0,
      id: subtitle?.id || `subtitle_${index}`,
      start: Number.isFinite(subtitle?.start) ? subtitle.start : Number(subtitle?.start) || 0,
      text: String(subtitle?.text || ''),
    }))
    .sort((left, right) => left.start - right.start)
}

function buildSubtitleTrack(languageKey, subtitles = []) {
  const normalizedLanguageKey = normalizeSubtitleLanguageKey(languageKey)
  const option = BUILTIN_SUBTITLE_LANGUAGE_OPTIONS.find((item) => item.id === normalizedLanguageKey)

  return {
    languageKey: normalizedLanguageKey,
    label: option?.label || buildFallbackSubtitleLanguageLabel(normalizedLanguageKey),
    source: option?.source || (normalizedLanguageKey === DEFAULT_SUBTITLE_LANGUAGE_KEY ? 'original' : 'translation'),
    subtitles: normalizeSubtitleArray(subtitles),
    translatable: option?.translatable ?? normalizedLanguageKey !== DEFAULT_SUBTITLE_LANGUAGE_KEY,
  }
}

export function normalizeSubtitleLanguageKey(languageKey, fallbackKey = DEFAULT_SUBTITLE_LANGUAGE_KEY) {
  const normalizedInput = String(languageKey || '').trim().toLowerCase()
  if (!normalizedInput) {
    return fallbackKey
  }

  const builtinKey = LANGUAGE_KEY_ALIASES.get(normalizedInput)
  if (builtinKey) {
    return builtinKey
  }

  const sanitizedKey = normalizedInput.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return sanitizedKey || fallbackKey
}

export function getSubtitleLanguageLabel(languageKey) {
  const normalizedLanguageKey = normalizeSubtitleLanguageKey(languageKey)
  return buildSubtitleTrack(normalizedLanguageKey).label
}

export function isTranslatableSubtitleLanguage(languageKey) {
  return normalizeSubtitleLanguageKey(languageKey) !== DEFAULT_SUBTITLE_LANGUAGE_KEY
}

export function normalizeVoiceoverLanguageKey(languageKey) {
  return normalizeSubtitleLanguageKey(languageKey, DEFAULT_VOICEOVER_LANGUAGE_KEY)
}

export function getVoiceoverLanguageCode(languageKey) {
  return getBuiltinSubtitleLanguageOption(normalizeVoiceoverLanguageKey(languageKey))?.voiceoverCode || ''
}

export function isVoiceoverSubtitleLanguageSupported(languageKey) {
  return Boolean(getVoiceoverLanguageCode(languageKey))
}

export function getVoiceoverLanguageOptions(subtitleTracks = null) {
  return getSubtitleLanguageOptions(subtitleTracks).filter((option) => isVoiceoverSubtitleLanguageSupported(option.id))
}

export function getVoiceoverTrackForLanguage(voiceoverTrack, activeLanguageKey) {
  if (!voiceoverTrack) {
    return null
  }

  return normalizeVoiceoverLanguageKey(voiceoverTrack.languageKey) === normalizeSubtitleLanguageKey(activeLanguageKey)
    ? { ...voiceoverTrack, languageKey: normalizeVoiceoverLanguageKey(voiceoverTrack.languageKey) }
    : null
}

export function normalizeSubtitleTracks(subtitleTracks = null, fallbackSubtitles = []) {
  const nextTracks = {}

  if (Array.isArray(subtitleTracks)) {
    nextTracks[DEFAULT_SUBTITLE_LANGUAGE_KEY] = buildSubtitleTrack(DEFAULT_SUBTITLE_LANGUAGE_KEY, subtitleTracks)
  } else if (subtitleTracks && typeof subtitleTracks === 'object') {
    for (const [rawLanguageKey, rawTrack] of Object.entries(subtitleTracks)) {
      const normalizedLanguageKey = normalizeSubtitleLanguageKey(rawTrack?.languageKey || rawTrack?.language_key || rawLanguageKey)
      const trackSubtitles = Array.isArray(rawTrack) ? rawTrack : rawTrack?.subtitles
      nextTracks[normalizedLanguageKey] = buildSubtitleTrack(normalizedLanguageKey, trackSubtitles)
    }
  }

  if (!nextTracks[DEFAULT_SUBTITLE_LANGUAGE_KEY]) {
    nextTracks[DEFAULT_SUBTITLE_LANGUAGE_KEY] = buildSubtitleTrack(DEFAULT_SUBTITLE_LANGUAGE_KEY, fallbackSubtitles)
  }

  return nextTracks
}

export function serializeSubtitleTracks(subtitleTracks = null, fallbackSubtitles = []) {
  const normalizedTracks = normalizeSubtitleTracks(subtitleTracks, fallbackSubtitles)
  const serializedTracks = {}

  for (const [languageKey, track] of Object.entries(normalizedTracks)) {
    if (languageKey !== DEFAULT_SUBTITLE_LANGUAGE_KEY && track.subtitles.length === 0) {
      continue
    }

    serializedTracks[languageKey] = buildSubtitleTrack(languageKey, track.subtitles)
  }

  return serializedTracks
}

export function getSubtitleLanguageOptions(subtitleTracks = null) {
  const normalizedTracks = normalizeSubtitleTracks(subtitleTracks)
  const builtinOptions = BUILTIN_SUBTITLE_LANGUAGE_OPTIONS.map((option) => ({
    ...option,
    hasSubtitles: getSubtitlesForLanguage(normalizedTracks, option.id).length > 0,
  }))

  const extraOptions = Object.keys(normalizedTracks)
    .filter((languageKey) => !builtinOptions.some((option) => option.id === languageKey))
    .map((languageKey) => ({
      id: languageKey,
      label: getSubtitleLanguageLabel(languageKey),
      source: languageKey === DEFAULT_SUBTITLE_LANGUAGE_KEY ? 'original' : 'translation',
      translatable: isTranslatableSubtitleLanguage(languageKey),
      hasSubtitles: getSubtitlesForLanguage(normalizedTracks, languageKey).length > 0,
    }))

  return [...builtinOptions, ...extraOptions]
}

export function normalizeActiveSubtitleLanguage(languageKey, subtitleTracks = null) {
  const normalizedLanguageKey = normalizeSubtitleLanguageKey(languageKey)
  const availableLanguageKeys = new Set(getSubtitleLanguageOptions(subtitleTracks).map((option) => option.id))
  return availableLanguageKeys.has(normalizedLanguageKey)
    ? normalizedLanguageKey
    : DEFAULT_SUBTITLE_LANGUAGE_KEY
}

export function getSubtitleCreateLanguageSelection(subtitleLanguageOptions = null, activeSubtitleLanguage = DEFAULT_SUBTITLE_LANGUAGE_KEY, hasOriginalSubtitles = false) {
  const normalizedActiveLanguage = normalizeSubtitleLanguageKey(activeSubtitleLanguage)
  const availableOptions = Array.isArray(subtitleLanguageOptions)
    ? subtitleLanguageOptions.filter((option) => hasOriginalSubtitles || option.translatable)
    : []
  const fallbackLanguageKey = DEFAULT_TRANSLATION_LANGUAGE_KEY
  const fallbackOption = availableOptions.find((option) => option.id === fallbackLanguageKey) || availableOptions[0] || {
    id: fallbackLanguageKey,
    label: getSubtitleLanguageLabel(fallbackLanguageKey),
    source: 'translation',
    translatable: true,
    hasSubtitles: false,
  }
  const selectedLanguageKey = hasOriginalSubtitles
    ? normalizedActiveLanguage
    : (normalizedActiveLanguage === DEFAULT_SUBTITLE_LANGUAGE_KEY ? fallbackOption.id : normalizedActiveLanguage)
  const selectedLanguageOption = availableOptions.find((option) => option.id === selectedLanguageKey)
    || fallbackOption

  return {
    availableOptions,
    canCreateSelectedLanguage: Boolean(selectedLanguageOption.translatable),
    selectedLanguageKey: selectedLanguageOption.id,
    selectedLanguageOption,
  }
}

export function getSubtitlesForLanguage(subtitleTracks = null, languageKey = DEFAULT_SUBTITLE_LANGUAGE_KEY) {
  const normalizedTracks = normalizeSubtitleTracks(subtitleTracks)
  const normalizedLanguageKey = normalizeSubtitleLanguageKey(languageKey)
  return normalizedTracks[normalizedLanguageKey]?.subtitles || []
}

export function getOriginalSubtitles(subtitleTracks = null) {
  return getSubtitlesForLanguage(subtitleTracks, DEFAULT_SUBTITLE_LANGUAGE_KEY)
}

export function setSubtitleTrackSubtitles(subtitleTracks = null, languageKey, subtitles = []) {
  const normalizedTracks = normalizeSubtitleTracks(subtitleTracks)
  const normalizedLanguageKey = normalizeSubtitleLanguageKey(languageKey)

  if (normalizedLanguageKey !== DEFAULT_SUBTITLE_LANGUAGE_KEY && (!Array.isArray(subtitles) || subtitles.length === 0)) {
    delete normalizedTracks[normalizedLanguageKey]
    return normalizedTracks
  }

  normalizedTracks[normalizedLanguageKey] = buildSubtitleTrack(normalizedLanguageKey, subtitles)
  return normalizedTracks
}

export function updateSubtitleTrackText(subtitleTracks = null, languageKey, subtitleId, nextText) {
  const currentTrackSubtitles = getSubtitlesForLanguage(subtitleTracks, languageKey)
  return setSubtitleTrackSubtitles(
    subtitleTracks,
    languageKey,
    currentTrackSubtitles.map((subtitle) => (
      subtitle.id === subtitleId
        ? { ...subtitle, text: nextText }
        : subtitle
    )),
  )
}

export function removeSubtitleFromTrack(subtitleTracks = null, languageKey, subtitleId) {
  const currentTrackSubtitles = getSubtitlesForLanguage(subtitleTracks, languageKey)
  return setSubtitleTrackSubtitles(
    subtitleTracks,
    languageKey,
    currentTrackSubtitles.filter((subtitle) => subtitle.id !== subtitleId),
  )
}