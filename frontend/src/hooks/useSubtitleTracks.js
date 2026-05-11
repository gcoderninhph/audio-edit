import { useCallback, useMemo, useState } from 'react'
import {
  DEFAULT_SUBTITLE_LANGUAGE_KEY,
  getOriginalSubtitles,
  getSubtitleLanguageOptions,
  getSubtitlesForLanguage,
  normalizeActiveSubtitleLanguage,
  normalizeSubtitleTracks,
  updateSubtitleTrackText,
} from '../utils/subtitleTracks'

export function useSubtitleTracks() {
  const [subtitleTracksState, setSubtitleTracksState] = useState(() => normalizeSubtitleTracks())
  const [activeSubtitleLanguageState, setActiveSubtitleLanguageState] = useState(DEFAULT_SUBTITLE_LANGUAGE_KEY)

  const setSubtitleTracks = useCallback((nextValue) => {
    setSubtitleTracksState((currentTracks) => {
      const resolvedTracks = typeof nextValue === 'function' ? nextValue(currentTracks) : nextValue
      return normalizeSubtitleTracks(resolvedTracks, getOriginalSubtitles(currentTracks))
    })
  }, [])

  const setActiveSubtitleLanguage = useCallback((nextLanguageKey) => {
    setActiveSubtitleLanguageState((currentLanguageKey) => normalizeActiveSubtitleLanguage(nextLanguageKey || currentLanguageKey))
  }, [])

  const visibleSubtitles = useMemo(
    () => getSubtitlesForLanguage(subtitleTracksState, activeSubtitleLanguageState),
    [activeSubtitleLanguageState, subtitleTracksState],
  )

  const originalSubtitles = useMemo(
    () => getOriginalSubtitles(subtitleTracksState),
    [subtitleTracksState],
  )

  const subtitleLanguageOptions = useMemo(
    () => getSubtitleLanguageOptions(subtitleTracksState),
    [subtitleTracksState],
  )

  const updateActiveSubtitle = useCallback((subtitleId, nextText) => {
    setSubtitleTracks((currentTracks) => updateSubtitleTrackText(currentTracks, activeSubtitleLanguageState, subtitleId, nextText))
  }, [activeSubtitleLanguageState, setSubtitleTracks])

  const restoreSubtitleState = useCallback((nextSubtitleTracks, nextActiveLanguage = DEFAULT_SUBTITLE_LANGUAGE_KEY) => {
    const normalizedTracks = normalizeSubtitleTracks(nextSubtitleTracks)
    setSubtitleTracksState(normalizedTracks)
    setActiveSubtitleLanguageState(normalizeActiveSubtitleLanguage(nextActiveLanguage, normalizedTracks))
  }, [])

  const resetSubtitleState = useCallback(() => {
    setSubtitleTracksState(normalizeSubtitleTracks())
    setActiveSubtitleLanguageState(DEFAULT_SUBTITLE_LANGUAGE_KEY)
  }, [])

  return {
    activeSubtitleLanguage: activeSubtitleLanguageState,
    originalSubtitles,
    resetSubtitleState,
    restoreSubtitleState,
    setActiveSubtitleLanguage,
    setSubtitleTracks,
    subtitleLanguageOptions,
    subtitleTracks: subtitleTracksState,
    updateActiveSubtitle,
    visibleSubtitles,
  }
}