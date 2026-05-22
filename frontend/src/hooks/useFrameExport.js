import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  buildDefaultExportFileName,
  chooseExportOutputDirectory,
  getDefaultExportDirectory,
  getExportFileNameLabel,
  revealExportFile,
} from '../utils/exportOutputTarget'
import {
  DEFAULT_SUBTITLE_SETTINGS,
  normalizeSubtitleSettings,
  serializeSubtitleSettings,
} from '../utils/subtitleRenderModel'
import { serializeSceneMotionConfig } from '../utils/sceneMotion'

function buildExportSignature(keptScenes, exportSubtitles, framePresetId, frameBackground, subtitleSettings, exportQualityProfileId, exportFileName, exportOutputDirectory) {
  const sceneSignature = keptScenes.map((scene) => `${scene.id}:${scene.start}-${scene.end}:${serializeSceneMotionConfig(scene.motion)}`).join('|')
  const subtitleSignature = exportSubtitles
    .map((subtitle) => `${subtitle.id}:${subtitle.start}-${subtitle.end}:${subtitle.text}`)
    .join('|')

  return `${framePresetId}::${serializeFrameBackground(frameBackground)}::${serializeSubtitleSettings(subtitleSettings)}::${serializeExportQualityProfileId(exportQualityProfileId)}::${getExportFileNameLabel(exportFileName)}::${exportOutputDirectory || ''}::${sceneSignature}::${subtitleSignature}`
}

function clampVolume(value, fallback = 1) {
  const normalizedValue = Number.isFinite(value) ? value : fallback
  return Math.max(0, Math.min(1, normalizedValue))
}

function normalizeStoredAudioMix(audioMix = {}) {
  return {
    videoVolume: clampVolume(Number(audioMix?.videoVolume), 1),
    voiceoverVolume: clampVolume(Number(audioMix?.voiceoverVolume), 1),
    customizedAudioTrackKey: String(audioMix?.customizedAudioTrackKey || ''),
  }
}

function getAudioTrackKey(voiceoverTrack) {
  return voiceoverTrack?.storedFileName || voiceoverTrack?.fileName || voiceoverTrack?.previewUrl || ''
}

function getSourceVideoName(videoSource) {
  return videoSource?.name || videoSource?.fileName || 'video.mp4'
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
  const [defaultExportOutputDirectory, setDefaultExportOutputDirectory] = useState('')
  const [exportOutputDirectory, setExportOutputDirectoryState] = useState('')
  const [exportFileName, setExportFileNameState] = useState(buildDefaultExportFileName())
  const [videoVolume, setVideoVolumeState] = useState(1)
  const [voiceoverVolume, setVoiceoverVolumeState] = useState(1)
  const [customizedAudioTrackKey, setCustomizedAudioTrackKey] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(createInitialExportProgress)
  const [exportUrl, setExportUrl] = useState(null)
  const [exportSavedFilePath, setExportSavedFilePath] = useState('')
  const [exportSize, setExportSize] = useState(0)
  const [lastExportSignature, setLastExportSignature] = useState('')
  const pendingRestoredAudioMixRef = useRef(null)

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
  const exportAudioMix = useMemo(() => ({ videoVolume, voiceoverVolume, customizedAudioTrackKey }), [customizedAudioTrackKey, videoVolume, voiceoverVolume])
  const hasVoiceoverTrack = Boolean(voiceoverTrack?.previewUrl)
  const hasCustomizedCurrentAudioMix = Boolean(currentAudioTrackKey) && customizedAudioTrackKey === currentAudioTrackKey
  const effectiveVideoVolume = hasVoiceoverTrack
    ? (hasCustomizedCurrentAudioMix ? videoVolume : 0)
    : videoVolume
  const effectiveVoiceoverVolume = hasVoiceoverTrack
    ? (hasCustomizedCurrentAudioMix ? voiceoverVolume : 1)
    : 1
  const resolvedExportOutputDirectory = exportOutputDirectory || defaultExportOutputDirectory
  const exportSignature = useMemo(
    () => `${buildExportSignature(effectiveKeptScenes, exportSubtitles, framePresetId, frameBackground, subtitleSettings, exportQualityProfileId, exportFileName, resolvedExportOutputDirectory)}::${currentAudioTrackKey}:${effectiveVideoVolume}:${effectiveVoiceoverVolume}`,
    [currentAudioTrackKey, effectiveKeptScenes, effectiveVideoVolume, effectiveVoiceoverVolume, exportFileName, exportQualityProfileId, exportSubtitles, frameBackground, framePresetId, resolvedExportOutputDirectory, subtitleSettings],
  )
  const hasFreshExport = Boolean(exportUrl || exportSavedFilePath) && lastExportSignature === exportSignature

  useEffect(() => {
    let isDisposed = false

    void getDefaultExportDirectory().then((directory) => {
      if (isDisposed || !directory) {
        return
      }

      setDefaultExportOutputDirectory(directory)
      setExportOutputDirectoryState((currentDirectory) => currentDirectory || directory)
    }).catch(() => undefined)

    return () => {
      isDisposed = true
    }
  }, [])

  useEffect(() => {
    setExportFileNameState(buildDefaultExportFileName(getSourceVideoName(videoFile)))
    const restoredAudioMix = pendingRestoredAudioMixRef.current
    pendingRestoredAudioMixRef.current = null
    setVideoVolumeState(restoredAudioMix?.videoVolume ?? 1)
    setVoiceoverVolumeState(restoredAudioMix?.voiceoverVolume ?? 1)
    setCustomizedAudioTrackKey(restoredAudioMix?.customizedAudioTrackKey ?? '')
  }, [videoFile])

  const restoreExportAudioMix = useCallback((audioMix) => {
    const restoredAudioMix = normalizeStoredAudioMix(audioMix)
    pendingRestoredAudioMixRef.current = restoredAudioMix
    setVideoVolumeState(restoredAudioMix.videoVolume)
    setVoiceoverVolumeState(restoredAudioMix.voiceoverVolume)
    setCustomizedAudioTrackKey(restoredAudioMix.customizedAudioTrackKey)
  }, [])

  const clearExportResult = useCallback(() => {
    setExportUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl)
      }

      return null
    })
    setExportSavedFilePath('')
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

  const setExportFileName = useCallback((nextExportFileName) => {
    setExportFileNameState(String(nextExportFileName || ''))
  }, [])

  const handleChooseExportOutputDirectory = useCallback(async () => {
    const nextDirectory = await chooseExportOutputDirectory()
    if (nextDirectory) {
      setExportOutputDirectoryState(nextDirectory)
    }
  }, [])

  const revealExportSavedFile = useCallback(async () => {
    if (!exportSavedFilePath) {
      return false
    }

    return revealExportFile(exportSavedFilePath)
  }, [exportSavedFilePath])

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

  const startExport = useCallback(async (exportOptions = {}) => {
    if (!videoFile || effectiveKeptScenes.length === 0) {
      void logExportDebug('Export request ignored because no video or kept scenes were available', {
        hasVideoFile: Boolean(videoFile),
        keptSceneCount: effectiveKeptScenes.length,
        videoDuration,
      }, 'warning')
      return
    }

    const hideWatermark = Boolean(exportOptions?.hideWatermark)

    const startedAt = Date.now()
    void logExportDebug('Export requested from UI', {
      exportFileName: getExportFileNameLabel(exportFileName),
      exportOutputDirectory: resolvedExportOutputDirectory || null,
      exportQualityProfileId,
      frameBackground: describeFrameBackground(frameBackground),
      framePresetId,
      hideWatermark,
      subtitleSettings,
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
          outputTarget: {
            directory: resolvedExportOutputDirectory,
            fileName: exportFileName,
          },
          exportQualityProfileId,
          frameSettings: {
            presetId: framePresetId,
            backgroundColor: frameBackground,
            hideWatermark,
          },
          subtitleSettings,
          audioMix: {
            videoVolume: effectiveVideoVolume,
            voiceoverVolume: hasVoiceoverTrack ? effectiveVoiceoverVolume : 0,
          },
          hideWatermark,
          voiceoverTrack,
        },
        handleExportProgress,
      )

      setExportUrl(result.url || null)
      setExportSavedFilePath(result.savedFilePath || '')
      setExportSize(result.size)
      setLastExportSignature(exportSignature)
      void logExportDebug('Export result is ready', {
        exportSize: result.size,
        savedFilePath: result.savedFilePath || null,
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
    exportFileName,
    exportQualityProfileId,
    exportSignature,
    exportSubtitles,
    frameBackground,
    framePresetId,
    hasVoiceoverTrack,
    resolvedExportOutputDirectory,
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
    exportFileName,
    setExportFileName,
    exportOutputDirectory: resolvedExportOutputDirectory,
    defaultExportOutputDirectory,
    chooseExportOutputDirectory: handleChooseExportOutputDirectory,
    videoVolume: effectiveVideoVolume,
    voiceoverVolume: effectiveVoiceoverVolume,
    handleVideoVolumeChange,
    handleVoiceoverVolumeChange,
    handleToggleVideoMute,
    exportAudioMix,
    restoreExportAudioMix,
    framePreset,
    frameSummary,
    frameBackgroundLabel,
    isExporting,
    exportProgress,
    exportUrl: hasFreshExport ? exportUrl : null,
    exportSavedFilePath: hasFreshExport ? exportSavedFilePath : '',
    exportSize: hasFreshExport ? exportSize : 0,
    isFFmpegLoaded: isFFmpegReady,
    revealExportSavedFile,
    startExport,
    clearExportResult,
  }
}