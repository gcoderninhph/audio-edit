import { useCallback } from 'react'
import { runTranscriptionJob, runTranslationJob, runVoiceoverJob } from './subtitleJobActions'

export function useVideoEditorSubtitleActions({
  activeSubtitleLanguage,
  deletedSceneIds,
  getCurrentSnapshot,
  keptScenes,
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
  removeActiveSubtitle,
  updateActiveSubtitle,
  videoDuration,
  videoFile,
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
      videoFile,
      videoDuration,
      sessionIdRef,
      pushState,
      getCurrentSnapshot,
      setIsTranslating,
      setTranslateProgress,
      setTranscriptionJobId,
      setTranslationJobId,
      scenes,
      deletedSceneIds,
      transcriptionJobId,
      translationJobId,
      performAutoSave,
      setSubtitleTracks,
      setActiveSubtitleLanguage,
      targetLanguageKey,
    })
  }, [activeSubtitleLanguage, deletedSceneIds, getCurrentSnapshot, originalSubtitles, performAutoSave, pushState, scenes, setActiveSubtitleLanguage, setIsTranslating, setSubtitleTracks, setTranscriptionJobId, setTranslateProgress, setTranslationJobId, sessionIdRef, subtitleTracks, transcriptionJobId, translationJobId, videoDuration, videoFile])

  const startVoiceover = useCallback(async (targetLanguageKey) => {
    await runVoiceoverJob({
      activeSubtitleLanguage,
      deletedSceneIds,
      keptScenes,
      scenes,
      sessionIdRef,
      setActiveSubtitleLanguage,
      setIsGeneratingVoiceover,
      setVoiceoverProgress,
      setLastVoiceoverAudioName,
      setVoiceoverTrack,
      subtitleTracks,
      targetLanguageKey,
    })
  }, [activeSubtitleLanguage, deletedSceneIds, keptScenes, scenes, sessionIdRef, setActiveSubtitleLanguage, setIsGeneratingVoiceover, setLastVoiceoverAudioName, setVoiceoverProgress, setVoiceoverTrack, subtitleTracks])

  const updateSubtitle = useCallback((id, newText) => {
    pushState(getCurrentSnapshot())
    updateActiveSubtitle(id, newText)
  }, [getCurrentSnapshot, pushState, updateActiveSubtitle])

  const removeSubtitle = useCallback((id) => {
    pushState(getCurrentSnapshot())
    removeActiveSubtitle(id)
  }, [getCurrentSnapshot, pushState, removeActiveSubtitle])

  return {
    startTranscription,
    startTranslation,
    startVoiceover,
    removeSubtitle,
    updateSubtitle,
  }
}