import { exportVideo } from './ffmpegManager'
import { getExportTimelineDurationSeconds, isAudioMixMuted, normalizeExportAudioMix } from './exportAudioMix'
import { DEFAULT_FRAME_BACKGROUND, DEFAULT_FRAME_PRESET_ID } from './frameComposer'
import { getLocalProject, getLocalProjectVideoReference, materializeLocalProjectVoiceover } from './projectStorage'
import { buildSceneMotionSegments } from './sceneMotion'
import { DEFAULT_SUBTITLE_SETTINGS, normalizeSubtitleSettings } from './subtitleRenderModel'
import { DEFAULT_SUBTITLE_LANGUAGE_KEY, getSubtitlesForLanguage, normalizeActiveSubtitleLanguage } from './subtitleTracks'

function getRuntimeBenchmarkConfig() {
  try {
    return window.desktopBridge?.getRuntimeConfig?.()?.exportBenchmark || null
  } catch {
    return null
  }
}

function getBenchmarkBridge() {
  return window.desktopBridge?.exportBenchmark || null
}

function buildVoiceoverTrack(voiceoverData, activeLanguage) {
  if (!voiceoverData) {
    return null
  }

  return {
    duration: voiceoverData.duration || 0,
    fileName: voiceoverData.fileName || 'voiceover.mp3',
    languageKey: voiceoverData.languageKey || activeLanguage,
    mimeType: voiceoverData.mimeType || 'audio/mpeg',
    previewUrl: voiceoverData.previewUrl,
    startTime: 0,
  }
}

async function loadBenchmarkProject(projectId) {
  const [project, videoReference, voiceoverData] = await Promise.all([
    getLocalProject(projectId),
    getLocalProjectVideoReference(projectId),
    materializeLocalProjectVoiceover(projectId),
  ])

  if (!videoReference) {
    throw new Error(`Project ${projectId} has no stored video.`)
  }

  const deletedSceneIds = new Set(Array.isArray(project?.deleted_ids) ? project.deleted_ids : [])
  const keptScenes = (Array.isArray(project?.scenes) ? project.scenes : [])
    .filter((scene) => !deletedSceneIds.has(scene.id))

  if (keptScenes.length === 0) {
    throw new Error(`Project ${projectId} has no kept scenes.`)
  }

  const activeLanguage = normalizeActiveSubtitleLanguage(
    project?.active_subtitle_language || DEFAULT_SUBTITLE_LANGUAGE_KEY,
    project?.subtitle_tracks,
  )
  const subtitles = getSubtitlesForLanguage(project?.subtitle_tracks, activeLanguage)
  const voiceoverTrack = buildVoiceoverTrack(voiceoverData, activeLanguage)

  return {
    activeLanguage,
    audioMix: project?.export_audio_mix || {},
    exportQualityProfileId: project?.export_quality_profile_id || 'balanced',
    frameSettings: {
      backgroundColor: project?.frame_background || DEFAULT_FRAME_BACKGROUND,
      hideWatermark: false,
      presetId: project?.frame_preset_id || DEFAULT_FRAME_PRESET_ID,
    },
    keptScenes,
    subtitles,
    subtitleSettings: normalizeSubtitleSettings(project?.subtitle_settings || DEFAULT_SUBTITLE_SETTINGS),
    videoSource: {
      kind: 'stored-project-video',
      name: videoReference.name || 'video.mp4',
      projectId,
      size: videoReference.size || 0,
      type: videoReference.mimeType || 'video/mp4',
      url: videoReference.url,
    },
    voiceoverTrack,
  }
}

function buildEffectSummary(exportData) {
  const motionSegments = buildSceneMotionSegments(exportData.keptScenes)
  const normalizedAudioMix = normalizeExportAudioMix(exportData.audioMix, exportData.voiceoverTrack)

  return {
    activeLanguage: exportData.activeLanguage,
    backgroundKind: typeof exportData.frameSettings.backgroundColor === 'object'
      ? exportData.frameSettings.backgroundColor.kind || 'custom'
      : 'color',
    hasVideoAudio: !isAudioMixMuted(normalizedAudioMix.videoVolume),
    hasVoiceoverAudio: normalizedAudioMix.hasVoiceoverTrack && !isAudioMixMuted(normalizedAudioMix.voiceoverVolume),
    includesWatermark: !exportData.frameSettings.hideWatermark,
    motionSegmentCount: motionSegments.length,
    sceneCount: exportData.keptScenes.length,
    subtitleCount: exportData.subtitles.length,
    timelineDurationSeconds: getExportTimelineDurationSeconds(exportData.keptScenes),
  }
}

function buildBenchmarkFailures({ elapsedMs, effectSummary, maxElapsedMs, result }) {
  const diagnostics = result?.diagnostics || {}
  const failures = []

  if (result?.backend !== 'native-fast') {
    failures.push(`Expected native-fast backend, got ${result?.backend || 'unknown'}.`)
  }
  if (!result?.savedFilePath) {
    failures.push('Expected native export to save directly to a local MP4 file.')
  }
  if (elapsedMs > maxElapsedMs) {
    failures.push(`Export took ${Math.round(elapsedMs)}ms, above ${maxElapsedMs}ms.`)
  }
  if (effectSummary.motionSegmentCount <= 0 || diagnostics.motionSegmentCount <= 0) {
    failures.push('Scene motion/zoom segments were not present in native export diagnostics.')
  }
  if (effectSummary.subtitleCount > 0 && diagnostics.overlayCount <= 0) {
    failures.push('Subtitle overlay assets were not included in native export diagnostics.')
  }
  if ((effectSummary.hasVideoAudio || effectSummary.hasVoiceoverAudio) && diagnostics.audioRenderEnabled !== true) {
    failures.push('Configured export audio mix was not rendered by native export.')
  }

  return failures
}

export function isExportBenchmarkRequested() {
  return Boolean(getRuntimeBenchmarkConfig()?.enabled)
}

export async function runExportBenchmarkIfRequested() {
  const config = getRuntimeBenchmarkConfig()
  const bridge = getBenchmarkBridge()
  if (!config?.enabled || !bridge?.complete) {
    return false
  }

  const startedAt = performance.now()
  let voiceoverPreviewUrl = ''

  try {
    const exportData = await loadBenchmarkProject(config.projectId)
    voiceoverPreviewUrl = exportData.voiceoverTrack?.previewUrl || ''
    const effectSummary = buildEffectSummary(exportData)
    const result = await exportVideo(
      exportData.videoSource,
      exportData.keptScenes,
      exportData.subtitles,
      {
        audioMix: exportData.audioMix,
        exportQualityProfileId: exportData.exportQualityProfileId,
        frameSettings: exportData.frameSettings,
        outputTarget: {
          directory: config.outputDirectory || '',
          fileName: `benchmark-${config.projectId}`,
        },
        subtitleSettings: exportData.subtitleSettings,
        voiceoverTrack: exportData.voiceoverTrack,
      },
    )
    const elapsedMs = Math.round(performance.now() - startedAt)
    const maxElapsedMs = Math.max(1, Number(config.maxElapsedMs) || 15000)
    const failures = buildBenchmarkFailures({ elapsedMs, effectSummary, maxElapsedMs, result })

    await bridge.complete({
      ok: failures.length === 0,
      elapsedMs,
      effectSummary,
      failures,
      maxElapsedMs,
      outputPath: result.savedFilePath || '',
      projectId: config.projectId,
      resultDiagnostics: result.diagnostics || null,
      size: result.size || 0,
    })
  } catch (error) {
    await bridge.complete({
      ok: false,
      elapsedMs: Math.round(performance.now() - startedAt),
      error: {
        message: error?.message || String(error),
        stack: error?.stack || '',
      },
      projectId: config.projectId,
    })
  } finally {
    if (voiceoverPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(voiceoverPreviewUrl)
    }
  }

  return true
}