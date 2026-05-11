import { useCallback } from 'react'
import { runTranscriptionJob, runTranslationJob, runVoiceoverJob } from './subtitleJobActions'

export function useVideoEditorSubtitleActions({
  activeSubtitleLanguage,
  deletedSceneIds,
  getCurrentSnapshot,
  originalSubtitles,
  performAutoSave,
  pushState,
  scenes,
  sessionIdRef,
  setActiveSubtitleLanguage,
  setIsGeneratingVoiceover,
  setIsTranscribing,
  setIsTranslating,
  setLastVoiceoverAudioName,
  setSubtitleTracks,
  setTranscribeProgress,
  setTranscriptionJobId,
  setTranslateProgress,
  setTranslationJobId,
  setVoiceoverProgress,
  setVoiceoverTrack,
  subtitleTracks,
  transcriptionJobId,
  translationJobId,
  updateActiveSubtitle,
  videoDuration,
  videoFile,
  voiceoverSubtitles,
}) {
  const startTranscription = useCallback(async () => {
    await runTranscriptionJob({
      videoFile,
      videoDuration,
      sessionIdRef,
      pushState,
      getCurrentSnapshot,
      setIsTranscribing,
      setTranscribeProgress,
      setTranscriptionJobId,
      scenes,
      deletedSceneIds,
      subtitleTracks,
      activeSubtitleLanguage,
      translationJobId,
      performAutoSave,
      setSubtitleTracks,
      setActiveSubtitleLanguage,
    })
  }, [activeSubtitleLanguage, deletedSceneIds, getCurrentSnapshot, performAutoSave, pushState, scenes, setActiveSubtitleLanguage, setSubtitleTracks, setTranscribeProgress, setTranscriptionJobId, setIsTranscribing, sessionIdRef, subtitleTracks, translationJobId, videoDuration, videoFile])

  const startTranslation = useCallback(async (targetLanguageKey) => {
    await runTranslationJob({
      originalSubtitles,
      subtitleTracks,
      activeSubtitleLanguage,
      sessionIdRef,
      pushState,
      getCurrentSnapshot,
      setIsTranslating,
      setTranslateProgress,
      setTranslationJobId,
      scenes,
      deletedSceneIds,
      transcriptionJobId,
      performAutoSave,
      setSubtitleTracks,
      setActiveSubtitleLanguage,
      targetLanguageKey,
    })
  }, [activeSubtitleLanguage, deletedSceneIds, getCurrentSnapshot, originalSubtitles, performAutoSave, pushState, scenes, setActiveSubtitleLanguage, setIsTranslating, setSubtitleTracks, setTranslateProgress, setTranslationJobId, sessionIdRef, subtitleTracks, transcriptionJobId])

  const startVoiceover = useCallback(async () => {
    await runVoiceoverJob({
      activeSubtitleLanguage,
      subtitles: voiceoverSubtitles,
      sessionIdRef,
      setIsGeneratingVoiceover,
      setVoiceoverProgress,
      setLastVoiceoverAudioName,
      setVoiceoverTrack,
    })
  }, [activeSubtitleLanguage, sessionIdRef, setIsGeneratingVoiceover, setLastVoiceoverAudioName, setVoiceoverProgress, setVoiceoverTrack, voiceoverSubtitles])

  const updateSubtitle = useCallback((id, newText) => {
    pushState(getCurrentSnapshot())
    updateActiveSubtitle(id, newText)
  }, [getCurrentSnapshot, pushState, updateActiveSubtitle])

  return {
    startTranscription,
    startTranslation,
    startVoiceover,
    updateSubtitle,
  }
}