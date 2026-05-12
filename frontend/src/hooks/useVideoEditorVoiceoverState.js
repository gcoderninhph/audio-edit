import { useMemo } from 'react'
import { buildExportSubtitles } from '../utils/frameComposer'
import { getVoiceoverTrackForLanguage } from '../utils/subtitleTracks'

export function useVideoEditorVoiceoverState({
  activeSubtitleLanguage,
  filteredSubtitles,
  keptScenes,
  lastVoiceoverAudioName,
  voiceoverTrack,
}) {
  const localizedVoiceoverTrack = useMemo(
    () => getVoiceoverTrackForLanguage(voiceoverTrack, activeSubtitleLanguage),
    [activeSubtitleLanguage, voiceoverTrack],
  )
  const localizedVoiceoverAudioName = localizedVoiceoverTrack ? lastVoiceoverAudioName : ''
  const voiceoverSubtitles = useMemo(() => {
    if (!filteredSubtitles.length) return []
    if (!keptScenes.length) return filteredSubtitles
    return buildExportSubtitles(filteredSubtitles, keptScenes)
  }, [filteredSubtitles, keptScenes])

  return {
    localizedVoiceoverAudioName,
    localizedVoiceoverTrack,
    voiceoverSubtitles,
  }
}