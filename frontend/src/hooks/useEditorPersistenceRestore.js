import { useCallback } from 'react'
import {
  restoreSavedTranscriptionJob,
  restoreSavedTranslationJob,
} from './editorPersistenceJobRestore'
import {
  getLocalProjectVideoReference,
  materializeLocalProjectVoiceover,
  releaseVideoUrl,
} from '../utils/projectStorage'
import { normalizeVoiceoverLanguageKey } from '../utils/subtitleTracks'

export function useEditorPersistenceRestore({
  performAutoSave,
  sessionIdRef,
  setActiveSubtitleLanguage,
  setIsTranscribing,
  setIsTranslating,
  setLastVoiceoverAudioName,
  setSubtitleTracks,
  setTranscribeProgress,
  setTranscriptionJobId,
  setTranslateProgress,
  setTranslationJobId,
  setVideoFileState,
  setVideoFilename,
  setVideoName,
  setVideoUrl,
  setVoiceoverTrack,
  videoUrl,
}) {
  const restoreVideoState = useCallback(async (projectId, data) => {
    if (!data.video_filename) return

    const restoredVideo = await getLocalProjectVideoReference(projectId)
    if (!restoredVideo) return

    releaseVideoUrl(videoUrl)
    setVideoFileState(restoredVideo.source)
    setVideoUrl(restoredVideo.url)
    setVideoName(data.video_original_name || restoredVideo.name || 'video.mp4')
    setVideoFilename(data.video_filename || restoredVideo.storedFileName)
  }, [setVideoFileState, setVideoFilename, setVideoName, setVideoUrl, videoUrl])

  const restoreVoiceoverState = useCallback(async (projectId, data) => {
    if (!data.voiceover_filename) {
      setLastVoiceoverAudioName('')
      setVoiceoverTrack(null)
      return
    }

    const restoredVoiceover = await materializeLocalProjectVoiceover(projectId)
    if (!restoredVoiceover) {
      setLastVoiceoverAudioName('')
      setVoiceoverTrack(null)
      return
    }

    const fileName = data.voiceover_original_name || restoredVoiceover.fileName || 'voiceover.mp3'
    setLastVoiceoverAudioName(fileName)
    setVoiceoverTrack({
      duration: restoredVoiceover.duration || 0,
      fileName,
      languageKey: restoredVoiceover.languageKey || data.voiceover_language_key || normalizeVoiceoverLanguageKey(),
      previewUrl: restoredVoiceover.previewUrl,
      startTime: 0,
    })
  }, [setLastVoiceoverAudioName, setVoiceoverTrack])

  const resumeSavedTranscription = useCallback((data) => restoreSavedTranscriptionJob(data, {
    performAutoSave,
    sessionIdRef,
    setIsTranscribing,
    setActiveSubtitleLanguage,
    setSubtitleTracks,
    setTranscribeProgress,
    setTranscriptionJobId,
  }), [performAutoSave, sessionIdRef, setActiveSubtitleLanguage, setIsTranscribing, setSubtitleTracks, setTranscribeProgress, setTranscriptionJobId])

  const resumeSavedTranslation = useCallback((data) => restoreSavedTranslationJob(data, {
    performAutoSave,
    sessionIdRef,
    setIsTranslating,
    setActiveSubtitleLanguage,
    setSubtitleTracks,
    setTranslateProgress,
    setTranslationJobId,
  }), [performAutoSave, sessionIdRef, setActiveSubtitleLanguage, setIsTranslating, setSubtitleTracks, setTranslateProgress, setTranslationJobId])

  return {
    restoreVideoState,
    restoreVoiceoverState,
    resumeSavedTranscription,
    resumeSavedTranslation,
  }
}