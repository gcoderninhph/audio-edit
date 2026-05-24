import { getExportFileNameLabel } from '../utils/exportOutputTarget'
import { serializeExportFrameRate } from '../utils/exportFrameRate'
import { serializeExportQualityProfileId } from '../utils/exportQualityProfile'
import { serializeFrameBackground } from '../utils/frameComposer'
import { serializeSceneMotionConfig } from '../utils/sceneMotion'
import { serializeSubtitleSettings } from '../utils/subtitleRenderModel'

export function buildExportSignature(keptScenes, exportSubtitles, framePresetId, frameBackground, subtitleSettings, exportQualityProfileId, exportFileName, exportOutputDirectory, exportFrameRate) {
  const sceneSignature = keptScenes.map((scene) => `${scene.id}:${scene.start}-${scene.end}:${serializeSceneMotionConfig(scene.motion)}`).join('|')
  const subtitleSignature = exportSubtitles
    .map((subtitle) => `${subtitle.id}:${subtitle.start}-${subtitle.end}:${subtitle.text}`)
    .join('|')

  return `${framePresetId}::${serializeFrameBackground(frameBackground)}::${serializeSubtitleSettings(subtitleSettings)}::${serializeExportQualityProfileId(exportQualityProfileId)}::${serializeExportFrameRate(exportFrameRate)}::${getExportFileNameLabel(exportFileName)}::${exportOutputDirectory || ''}::${sceneSignature}::${subtitleSignature}`
}

export function clampVolume(value, fallback = 1) {
  const normalizedValue = Number.isFinite(value) ? value : fallback
  return Math.max(0, Math.min(1, normalizedValue))
}

export function normalizeStoredAudioMix(audioMix = {}) {
  return {
    videoVolume: clampVolume(Number(audioMix?.videoVolume), 1),
    voiceoverVolume: clampVolume(Number(audioMix?.voiceoverVolume), 1),
    customizedAudioTrackKey: String(audioMix?.customizedAudioTrackKey || ''),
  }
}

export function getAudioTrackKey(voiceoverTrack) {
  return voiceoverTrack?.storedFileName || voiceoverTrack?.fileName || voiceoverTrack?.previewUrl || ''
}

export function getSourceVideoName(videoSource) {
  return videoSource?.name || videoSource?.fileName || 'video.mp4'
}

export function createInitialExportProgress() {
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

export function mergeExportProgress(previous, update) {
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

export function createFullVideoScene(videoDuration) {
  return {
    id: '__full-video__',
    start: 0,
    end: videoDuration,
    duration: videoDuration,
  }
}