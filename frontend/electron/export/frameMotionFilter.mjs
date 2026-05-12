import { SCENE_MOTION_MODES, buildSceneMotionSegments } from '../../src/utils/sceneMotion.js'

function formatFilterNumber(value, digits = 4) {
  return Number(value || 0).toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

function buildConditionalExpression(segments, valueBuilder, fallbackExpression) {
  return segments.reduceRight((expression, segment) => (
    `if(between(t,${formatFilterNumber(segment.start)},${formatFilterNumber(segment.end)}),${valueBuilder(segment)},${expression})`
  ), fallbackExpression)
}

function buildProgressExpression(segment) {
  const start = formatFilterNumber(segment.start)
  const duration = formatFilterNumber(Math.max(0.001, segment.duration))
  const offset = formatFilterNumber(segment.progressOffset || 0)
  return `min(max(((t-${start})+${offset})/${duration},0),1)`
}

function buildMotionAmountExpression(segment) {
  const progressExpression = buildProgressExpression(segment)

  if (segment.mode === SCENE_MOTION_MODES.ZOOM_IN) {
    return '1'
  }

  if (segment.mode === SCENE_MOTION_MODES.ANIMATION_ZOOM_OUT) {
    return `1-(${progressExpression})`
  }

  if (segment.mode === SCENE_MOTION_MODES.ANIMATION_ZOOM_IN) {
    return progressExpression
  }

  return '0'
}

function buildZoomExpression(segments) {
  return buildConditionalExpression(
    segments,
    (segment) => `1+(${formatFilterNumber(segment.zoomScale - 1)})*(${buildMotionAmountExpression(segment)})`,
    '1',
  )
}

function buildFocusExpression(segments, axis) {
  return buildConditionalExpression(
    segments,
    (segment) => `0.5+(${formatFilterNumber(segment[axis] - 0.5)})*(${buildMotionAmountExpression(segment)})`,
    '0.5',
  )
}

export function buildFrameSceneMotionSegments(keptScenes) {
  return buildSceneMotionSegments(keptScenes)
}

export function buildChunkSceneMotionSegments(sceneMotionSegments, chunk) {
  const chunkStart = Number(chunk?.start) || 0
  const chunkEnd = chunkStart + Math.max(0, Number(chunk?.duration) || 0)

  return (sceneMotionSegments || [])
    .map((segment) => {
      const absoluteStart = Math.max(chunkStart, segment.start)
      const absoluteEnd = Math.min(chunkEnd, segment.end)
      const start = absoluteStart - chunkStart
      const end = absoluteEnd - chunkStart
      if (absoluteEnd <= absoluteStart) {
        return null
      }

      return {
        ...segment,
        start,
        end,
        duration: Math.max(0.001, Number(segment.duration) || end - start),
        progressOffset: Math.max(0, absoluteStart - segment.start) + (Number(segment.progressOffset) || 0),
      }
    })
    .filter(Boolean)
}

export function hasSceneMotionSegments(motionSegments) {
  return Array.isArray(motionSegments) && motionSegments.length > 0
}

export function buildNativeForegroundScale({ inputLabel, outputLabel, framePreset, motionSegments }) {
  if (!hasSceneMotionSegments(motionSegments)) {
    return `[${inputLabel}]scale=w=${framePreset.width}:h=${framePreset.height}:force_original_aspect_ratio=decrease,setsar=1[${outputLabel}]`
  }

  const baseScaleExpression = `min(${framePreset.width}/iw,${framePreset.height}/ih)`
  const zoomExpression = buildZoomExpression(motionSegments)

  return `[${inputLabel}]scale=w='trunc((iw*${baseScaleExpression}*(${zoomExpression}))/2)*2':h='trunc((ih*${baseScaleExpression}*(${zoomExpression}))/2)*2':eval=frame,setsar=1[${outputLabel}]`
}

export function buildNativeForegroundOverlay({ backgroundLabel, foregroundLabel, outputLabel, framePreset, motionSegments }) {
  if (!hasSceneMotionSegments(motionSegments)) {
    return `[${backgroundLabel}][${foregroundLabel}]overlay=(W-w)/2:(H-h)/2:shortest=1:eof_action=pass[${outputLabel}]`
  }

  const focusXExpression = buildFocusExpression(motionSegments, 'focusX')
  const focusYExpression = buildFocusExpression(motionSegments, 'focusY')
  const xExpression = `if(gte(w,${framePreset.width}),min(max(${framePreset.width}/2-(${focusXExpression})*w,${framePreset.width}-w),0),(${framePreset.width}-w)/2)`
  const yExpression = `if(gte(h,${framePreset.height}),min(max(${framePreset.height}/2-(${focusYExpression})*h,${framePreset.height}-h),0),(${framePreset.height}-h)/2)`

  return `[${backgroundLabel}][${foregroundLabel}]overlay=x='${xExpression}':y='${yExpression}':shortest=1:eof_action=pass:eval=frame[${outputLabel}]`
}
