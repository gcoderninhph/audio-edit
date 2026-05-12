export const SCENE_MOTION_MODES = Object.freeze({
  NONE: 'none',
  ZOOM_IN: 'zoom-in',
  ANIMATION_ZOOM_OUT: 'animation-zoom-out',
  ANIMATION_ZOOM_IN: 'animation-zoom-in',
})

export const DEFAULT_SCENE_MOTION_CONFIG = Object.freeze({
  mode: SCENE_MOTION_MODES.NONE,
  enabled: false,
  zoomScale: 1.18,
  focusX: 0.5,
  focusY: 0.5,
  detectionStatus: '',
})

const MIN_ZOOM_SCALE = 1
const MAX_ZOOM_SCALE = 2.2

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizeUnit(value, fallback = 0.5) {
  const normalizedValue = Number.isFinite(Number(value)) ? Number(value) : fallback
  return clamp(normalizedValue, 0, 1)
}

function normalizeSceneMotionMode(sceneMotion) {
  const mode = typeof sceneMotion?.mode === 'string' ? sceneMotion.mode : ''
  if (Object.values(SCENE_MOTION_MODES).includes(mode)) {
    return mode
  }

  return sceneMotion?.enabled ? SCENE_MOTION_MODES.ANIMATION_ZOOM_IN : SCENE_MOTION_MODES.NONE
}

function isActiveSceneMotionMode(mode) {
  return mode !== SCENE_MOTION_MODES.NONE
}

function getSceneMotionAmount(mode, progress) {
  const boundedProgress = clamp(Number(progress) || 0, 0, 1)

  if (mode === SCENE_MOTION_MODES.ZOOM_IN) {
    return 1
  }

  if (mode === SCENE_MOTION_MODES.ANIMATION_ZOOM_OUT) {
    return 1 - boundedProgress
  }

  if (mode === SCENE_MOTION_MODES.ANIMATION_ZOOM_IN) {
    return boundedProgress
  }

  return 0
}

function buildSceneMotionRenderState(config, progress) {
  const amount = isSceneMotionEnabled(config) ? getSceneMotionAmount(config.mode, progress) : 0

  return {
    enabled: amount > 0.001,
    mode: config.mode,
    zoom: 1 + ((config.zoomScale - 1) * amount),
    focusX: 0.5 + ((config.focusX - 0.5) * amount),
    focusY: 0.5 + ((config.focusY - 0.5) * amount),
    progress,
    wave: amount,
  }
}

export function normalizeSceneMotionConfig(sceneMotion = null) {
  const nextConfig = sceneMotion && typeof sceneMotion === 'object' ? sceneMotion : {}
  const mode = normalizeSceneMotionMode(nextConfig)
  const zoomScale = clamp(Number(nextConfig.zoomScale) || DEFAULT_SCENE_MOTION_CONFIG.zoomScale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE)

  return {
    mode,
    enabled: isActiveSceneMotionMode(mode),
    zoomScale,
    focusX: normalizeUnit(nextConfig.focusX),
    focusY: normalizeUnit(nextConfig.focusY),
    detectionStatus: typeof nextConfig.detectionStatus === 'string' ? nextConfig.detectionStatus : '',
  }
}

export function isSceneMotionEnabled(sceneMotion = null) {
  const config = normalizeSceneMotionConfig(sceneMotion)
  return isActiveSceneMotionMode(config.mode) && config.zoomScale > 1.001
}

export function serializeSceneMotionConfig(sceneMotion = null) {
  const config = normalizeSceneMotionConfig(sceneMotion)
  return `${config.mode}:${config.zoomScale.toFixed(2)}:${config.focusX.toFixed(3)}:${config.focusY.toFixed(3)}`
}

export function getSceneMotionRenderState(scene, currentTime) {
  const config = normalizeSceneMotionConfig(scene?.motion)
  const duration = Math.max(0.001, Number(scene?.duration) || (Number(scene?.end) || 0) - (Number(scene?.start) || 0))
  const progress = clamp(((Number(currentTime) || 0) - (Number(scene?.start) || 0)) / duration, 0, 1)

  return buildSceneMotionRenderState(config, progress)
}

export function buildSceneMotionSegments(keptScenes = []) {
  let timelineStart = 0
  const segments = []

  for (const scene of keptScenes) {
    const duration = Math.max(0, Number(scene?.duration) || (Number(scene?.end) || 0) - (Number(scene?.start) || 0))
    const config = normalizeSceneMotionConfig(scene?.motion)

    if (duration > 0 && isSceneMotionEnabled(config)) {
      segments.push({
        sceneId: scene.id,
        start: timelineStart,
        end: timelineStart + duration,
        duration,
        mode: config.mode,
        zoomScale: config.zoomScale,
        focusX: config.focusX,
        focusY: config.focusY,
        progressOffset: 0,
      })
    }

    timelineStart += duration
  }

  return segments
}

export function getSceneMotionAtTimelineTime(sceneMotionSegments = [], currentTime = 0) {
  const time = Number(currentTime) || 0
  const segment = sceneMotionSegments.find((candidate) => time >= candidate.start && time <= candidate.end)
  if (!segment) {
    return { enabled: false, zoom: 1, focusX: 0.5, focusY: 0.5, progress: 0, wave: 0 }
  }

  const progress = clamp((time - segment.start + (Number(segment.progressOffset) || 0)) / Math.max(0.001, segment.duration), 0, 1)
  return buildSceneMotionRenderState(normalizeSceneMotionConfig(segment), progress)
}
