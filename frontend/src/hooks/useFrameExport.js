import { useCallback, useEffect, useMemo, useState } from 'react'
import { exportVideo, isFFmpegReady } from '../utils/ffmpegManager'
import { logExportDebug } from '../utils/desktopLogger'
import {
  buildExportSubtitles,
  DEFAULT_FRAME_BACKGROUND,
  DEFAULT_FRAME_PRESET_ID,
  describeFrameBackground,
  getFrameBackgroundLabel,
  getFramePresetById,
  getFrameSummary,
  sanitizeFrameBackground,
  serializeFrameBackground,
} from '../utils/frameComposer'
import {
  DEFAULT_EXPORT_QUALITY_PROFILE_ID,
  normalizeExportQualityProfileId,
  serializeExportQualityProfileId,
} from '../utils/exportQualityProfile'
import {
  DEFAULT_SUBTITLE_SETTINGS,
  normalizeSubtitleSettings,
  serializeSubtitleSettings,
} from '../utils/subtitleRenderModel'

function buildExportSignature(keptScenes, exportSubtitles, framePresetId, frameBackground, subtitleSettings, exportQualityProfileId) {
  const sceneSignature = keptScenes.map((scene) => `${scene.id}:${scene.start}-${scene.end}`).join('|')
  const subtitleSignature = exportSubtitles
    .map((subtitle) => `${subtitle.id}:${subtitle.start}-${subtitle.end}:${subtitle.text}`)
    .join('|')

  return `${framePresetId}::${serializeFrameBackground(frameBackground)}::${serializeSubtitleSettings(subtitleSettings)}::${serializeExportQualityProfileId(exportQualityProfileId)}::${sceneSignature}::${subtitleSignature}`
}

function clampVolume(value, fallback = 1) {
  const normalizedValue = Number.isFinite(value) ? value : fallback
  return Math.max(0, Math.min(1, normalizedValue))
}

function getAudioTrackKey(voiceoverTrack) {
  return voiceoverTrack?.previewUrl || voiceoverTrack?.storedFileName || voiceoverTrack?.fileName || ''
}

function createInitialExportProgress() {
  return {
    phase: '',
    percent: 0,
    stagePercent: 0,
    detail: '',
    logs: [],
    elapsedMs: 0,
    ffmpegTimeMicroseconds: 0,
    sceneCount: 0,
    subtitleCount: 0,
    startedAt: null,
  }
}

function mergeExportProgress(previous, update) {
  const nextLogs = update.logEntry
    ? [...previous.logs, update.logEntry].slice(-120)
    : previous.logs

  return {
    ...previous,
    ...Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined)),
    logs: nextLogs,
    elapsedMs: previous.startedAt ? Date.now() - previous.startedAt : previous.elapsedMs,
  }
}

function createFullVideoScene(videoDuration) {
  return {
    id: '__full-video__',
    start: 0,
    end: videoDuration,
    duration: videoDuration,
  }
}

export function useFrameExport({ videoFile, keptScenes, filteredSubtitles, videoDuration = 0, voiceoverTrack }) {
  const [framePresetId, setFramePresetIdState] = useState(DEFAULT_FRAME_PRESET_ID)
  const [frameBackground, setFrameBackgroundState] = useState(DEFAULT_FRAME_BACKGROUND)
  const [subtitleSettings, setSubtitleSettingsState] = useState(DEFAULT_SUBTITLE_SETTINGS)
  const [exportQualityProfileId, setExportQualityProfileIdState] = useState(DEFAULT_EXPORT_QUALITY_PROFILE_ID)
  const [videoVolume, setVideoVolumeState] = useState(1)
  const [voiceoverVolume, setVoiceoverVolumeState] = useState(1)
  const [customizedAudioTrackKey, setCustomizedAudioTrackKey] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(createInitialExportProgress)
  const [exportUrl, setExportUrl] = useState(null)
  const [exportSize, setExportSize] = useState(0)
  const [lastExportSignature, setLastExportSignature] = useState('')

  const framePreset = useMemo(() => getFramePresetById(framePresetId), [framePresetId])
  const frameSummary = useMemo(() => getFrameSummary(framePresetId), [framePresetId])
  const frameBackgroundLabel = useMemo(() => getFrameBackgroundLabel(frameBackground), [frameBackground])
  const effectiveKeptScenes = useMemo(() => {
    if (Array.isArray(keptScenes) && keptScenes.length > 0) {
      return keptScenes
    }

    if (videoDuration > 0) {
      return [createFullVideoScene(videoDuration)]
    }

    return []
  }, [keptScenes, videoDuration])
  const exportSubtitles = useMemo(
    () => buildExportSubtitles(filteredSubtitles, effectiveKeptScenes),
    [effectiveKeptScenes, filteredSubtitles],
  )
  const currentAudioTrackKey = useMemo(() => getAudioTrackKey(voiceoverTrack), [voiceoverTrack])
  const hasVoiceoverTrack = Boolean(voiceoverTrack?.previewUrl)
  const hasCustomizedCurrentAudioMix = Boolean(currentAudioTrackKey) && customizedAudioTrackKey === currentAudioTrackKey
  const effectiveVideoVolume = hasVoiceoverTrack
    ? (hasCustomizedCurrentAudioMix ? videoVolume : 0)
    : videoVolume
  const effectiveVoiceoverVolume = hasVoiceoverTrack
    ? (hasCustomizedCurrentAudioMix ? voiceoverVolume : 1)
    : 1
  const exportSignature = useMemo(
    () => `${buildExportSignature(effectiveKeptScenes, exportSubtitles, framePresetId, frameBackground, subtitleSettings, exportQualityProfileId)}::${currentAudioTrackKey}:${effectiveVideoVolume}:${effectiveVoiceoverVolume}`,
    [currentAudioTrackKey, effectiveKeptScenes, effectiveVideoVolume, effectiveVoiceoverVolume, exportQualityProfileId, exportSubtitles, frameBackground, framePresetId, subtitleSettings],
  )
  const hasFreshExport = exportUrl && lastExportSignature === exportSignature

  useEffect(() => {
    setVideoVolumeState(1)
    setVoiceoverVolumeState(1)
    setCustomizedAudioTrackKey('')
  }, [videoFile])

  const clearExportResult = useCallback(() => {
    setExportUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl)
      }

      return null
    })
    setExportSize(0)
    setLastExportSignature('')
  }, [])

  useEffect(() => {
    return () => {
      if (exportUrl) {
        URL.revokeObjectURL(exportUrl)
      }
    }
  }, [exportUrl])

  useEffect(() => {
    if (!isExporting) {
      return undefined
    }

    const timerId = window.setInterval(() => {
      setExportProgress((current) => {
        if (!current.startedAt) {
          return current
        }

        return {
          ...current,
          elapsedMs: Date.now() - current.startedAt,
        }
      })
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [isExporting])

  const setFramePresetId = useCallback((nextFramePresetId) => {
    setFramePresetIdState(nextFramePresetId)
  }, [])

  const setFrameBackground = useCallback((nextFrameBackground) => {
    setFrameBackgroundState(sanitizeFrameBackground(nextFrameBackground))
  }, [])

  const setSubtitleSettings = useCallback((nextSubtitleSettings) => {
    setSubtitleSettingsState((currentSubtitleSettings) => normalizeSubtitleSettings(
      typeof nextSubtitleSettings === 'function'
        ? nextSubtitleSettings(currentSubtitleSettings)
        : nextSubtitleSettings,
    ))
  }, [])

  const setExportQualityProfileId = useCallback((nextExportQualityProfileId) => {
    setExportQualityProfileIdState(normalizeExportQualityProfileId(nextExportQualityProfileId))
  }, [])

  const handleVideoVolumeChange = useCallback((nextVolume) => {
    setCustomizedAudioTrackKey(currentAudioTrackKey)
    setVideoVolumeState(clampVolume(nextVolume))
  }, [currentAudioTrackKey])

  const handleVoiceoverVolumeChange = useCallback((nextVolume) => {
    setCustomizedAudioTrackKey(currentAudioTrackKey)
    setVoiceoverVolumeState(clampVolume(nextVolume))
  }, [currentAudioTrackKey])

  const handleToggleVideoMute = useCallback(() => {
    setCustomizedAudioTrackKey(currentAudioTrackKey)
    setVideoVolumeState(effectiveVideoVolume > 0 ? 0 : 1)
  }, [currentAudioTrackKey, effectiveVideoVolume])

  const startExport = useCallback(async () => {
    if (!videoFile || effectiveKeptScenes.length === 0) {
      void logExportDebug('Export request ignored because no video or kept scenes were available', {
        hasVideoFile: Boolean(videoFile),
        keptSceneCount: effectiveKeptScenes.length,
        videoDuration,
      }, 'warning')
      return
    }

    const startedAt = Date.now()
    void logExportDebug('Export requested from UI', {
      exportQualityProfileId,
      frameBackground: describeFrameBackground(frameBackground),
      framePresetId,
      hasVoiceoverTrack,
      keptSceneCount: effectiveKeptScenes.length,
      subtitleCount: exportSubtitles.length,
      videoVolume: effectiveVideoVolume,
      videoSourceKind: videoFile?.kind || (videoFile instanceof File ? 'file' : 'blob'),
      voiceoverVolume: effectiveVoiceoverVolume,
    })
    setIsExporting(true)
    clearExportResult()
    setExportProgress({
      ...createInitialExportProgress(),
      phase: 'preparing',
      percent: 0,
      detail: `Starting export • ${effectiveKeptScenes.length} scenes • ${exportSubtitles.length} subtitles`,
      sceneCount: effectiveKeptScenes.length,
      subtitleCount: exportSubtitles.length,
      startedAt,
      logs: [{
        phase: 'preparing',
        level: 'info',
        message: `Start export with ${effectiveKeptScenes.length} scenes and ${exportSubtitles.length} subtitles`,
        timestamp: startedAt,
      }],
    })

    const handleExportProgress = (update) => {
      setExportProgress((current) => mergeExportProgress(current, update))
    }

    try {
      const result = await exportVideo(
        videoFile,
        effectiveKeptScenes,
        exportSubtitles,
        {
          exportQualityProfileId,
          frameSettings: {
            presetId: framePresetId,
            backgroundColor: frameBackground,
          },
          subtitleSettings,
          audioMix: {
            videoVolume: effectiveVideoVolume,
            voiceoverVolume: hasVoiceoverTrack ? effectiveVoiceoverVolume : 0,
          },
          voiceoverTrack,
        },
        handleExportProgress,
      )

      setExportUrl(result.url)
      setExportSize(result.size)
      setLastExportSignature(exportSignature)
      void logExportDebug('Export result is ready', {
        exportSize: result.size,
        frameBackground: describeFrameBackground(frameBackground),
        framePresetId,
        hasVoiceoverTrack,
      })
    } catch (error) {
      console.error('Export failed:', error)
      void logExportDebug('Export failed in useFrameExport', error, 'error')
      setExportProgress((current) => mergeExportProgress(current, {
        phase: 'error',
        detail: error.message,
        logEntry: {
          phase: 'error',
          level: 'error',
          message: error.message,
          timestamp: Date.now(),
        },
      }))
      alert(`Export failed: ${error.message}`)
    } finally {
      setIsExporting(false)
    }
  }, [
    clearExportResult,
    effectiveKeptScenes,
    effectiveVideoVolume,
    effectiveVoiceoverVolume,
    exportQualityProfileId,
    exportSignature,
    exportSubtitles,
    frameBackground,
    framePresetId,
    hasVoiceoverTrack,
    subtitleSettings,
    videoDuration,
    videoFile,
    voiceoverTrack,
  ])

  return {
    framePresetId,
    setFramePresetId,
    frameBackground,
    setFrameBackground,
    subtitleSettings,
    setSubtitleSettings,
    exportQualityProfileId,
    setExportQualityProfileId,
    videoVolume: effectiveVideoVolume,
    voiceoverVolume: effectiveVoiceoverVolume,
    handleVideoVolumeChange,
    handleVoiceoverVolumeChange,
    handleToggleVideoMute,
    framePreset,
    frameSummary,
    frameBackgroundLabel,
    isExporting,
    exportProgress,
    exportUrl: hasFreshExport ? exportUrl : null,
    exportSize: hasFreshExport ? exportSize : 0,
    isFFmpegLoaded: isFFmpegReady,
    startExport,
    clearExportResult,
  }
}