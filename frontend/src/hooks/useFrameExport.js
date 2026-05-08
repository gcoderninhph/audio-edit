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

function buildExportSignature(keptScenes, exportSubtitles, framePresetId, frameBackground) {
  const sceneSignature = keptScenes.map((scene) => `${scene.id}:${scene.start}-${scene.end}`).join('|')
  const subtitleSignature = exportSubtitles
    .map((subtitle) => `${subtitle.id}:${subtitle.start}-${subtitle.end}:${subtitle.text}`)
    .join('|')

  return `${framePresetId}::${serializeFrameBackground(frameBackground)}::${sceneSignature}::${subtitleSignature}`
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

export function useFrameExport({ videoFile, keptScenes, filteredSubtitles }) {
  const [framePresetId, setFramePresetIdState] = useState(DEFAULT_FRAME_PRESET_ID)
  const [frameBackground, setFrameBackgroundState] = useState(DEFAULT_FRAME_BACKGROUND)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(createInitialExportProgress)
  const [exportUrl, setExportUrl] = useState(null)
  const [exportSize, setExportSize] = useState(0)
  const [lastExportSignature, setLastExportSignature] = useState('')

  const framePreset = useMemo(() => getFramePresetById(framePresetId), [framePresetId])
  const frameSummary = useMemo(() => getFrameSummary(framePresetId), [framePresetId])
  const frameBackgroundLabel = useMemo(() => getFrameBackgroundLabel(frameBackground), [frameBackground])
  const exportSubtitles = useMemo(
    () => buildExportSubtitles(filteredSubtitles, keptScenes),
    [filteredSubtitles, keptScenes],
  )
  const exportSignature = useMemo(
    () => buildExportSignature(keptScenes, exportSubtitles, framePresetId, frameBackground),
    [exportSubtitles, frameBackground, framePresetId, keptScenes],
  )
  const hasFreshExport = exportUrl && lastExportSignature === exportSignature

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

  const startExport = useCallback(async () => {
    if (!videoFile || keptScenes.length === 0) {
      void logExportDebug('Export request ignored because no video or kept scenes were available', {
        hasVideoFile: Boolean(videoFile),
        keptSceneCount: keptScenes.length,
      }, 'warning')
      return
    }

    const startedAt = Date.now()
    void logExportDebug('Export requested from UI', {
      frameBackground: describeFrameBackground(frameBackground),
      framePresetId,
      keptSceneCount: keptScenes.length,
      subtitleCount: exportSubtitles.length,
      videoSourceKind: videoFile?.kind || (videoFile instanceof File ? 'file' : 'blob'),
    })
    setIsExporting(true)
    clearExportResult()
    setExportProgress({
      ...createInitialExportProgress(),
      phase: 'preparing',
      percent: 0,
      detail: `Khởi tạo export • ${keptScenes.length} cảnh • ${exportSubtitles.length} subtitle`,
      sceneCount: keptScenes.length,
      subtitleCount: exportSubtitles.length,
      startedAt,
      logs: [{
        phase: 'preparing',
        level: 'info',
        message: `Start export with ${keptScenes.length} scenes and ${exportSubtitles.length} subtitles`,
        timestamp: startedAt,
      }],
    })

    const handleExportProgress = (update) => {
      setExportProgress((current) => mergeExportProgress(current, update))
    }

    try {
      const result = await exportVideo(
        videoFile,
        keptScenes,
        exportSubtitles,
        {
          presetId: framePresetId,
          backgroundColor: frameBackground,
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
  }, [clearExportResult, exportSignature, exportSubtitles, frameBackground, framePresetId, keptScenes, videoFile])

  return {
    framePresetId,
    setFramePresetId,
    frameBackground,
    setFrameBackground,
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