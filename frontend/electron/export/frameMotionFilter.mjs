import { SCENE_MOTION_MODES, buildSceneMotionSegments } from '../../src/utils/sceneMotion.js'

function formatFilterNumber(value, digits = 6) {
  return Number(value || 0).toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

function buildSegmentCondition(segment, timeExpression = 't') {
  return `gte(${timeExpression},${formatFilterNumber(segment.start)})*lt(${timeExpression},${formatFilterNumber(segment.end)})`
}

function buildNearestEvenExpression(expression) {
  return `2*round((${expression})/2)`
}

function buildPixelExpression(expression) {
  return `round(${expression})`
}

function buildConditionalExpression(segments, valueBuilder, fallbackExpression, timeExpression = 't') {
  return segments.reduceRight((expression, segment) => (
    `if(${buildSegmentCondition(segment, timeExpression)},${valueBuilder(segment)},${expression})`
  ), fallbackExpression)
}

function buildProgressExpression(segment, timeExpression = 't') {
  const start = formatFilterNumber(segment.start)
  const duration = formatFilterNumber(Math.max(0.001, segment.duration))
  const offset = formatFilterNumber(segment.progressOffset || 0)
  return `min(max(((${timeExpression}-${start})+${offset})/${duration},0),1)`
}

function buildMotionAmountExpression(segment, timeExpression = 't') {
  const progressExpression = buildProgressExpression(segment, timeExpression)

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

function buildZoomExpression(segments, timeExpression = 't') {
  return buildConditionalExpression(
    segments,
    (segment) => `1+(${formatFilterNumber(segment.zoomScale - 1)})*(${buildMotionAmountExpression(segment, timeExpression)})`,
    '1',
    timeExpression,
  )
}

function buildFocusExpression(segments, axis, timeExpression = 't') {
  return buildConditionalExpression(
    segments,
    (segment) => `0.5+(${formatFilterNumber(segment[axis] - 0.5)})*(${buildMotionAmountExpression(segment, timeExpression)})`,
    '0.5',
    timeExpression,
  )
}

function buildSingleSegmentMotionExpressions(segment, timeExpression = 't') {
  const amountExpression = buildMotionAmountExpression(segment, timeExpression)
  const zoomExpression = `1+(${formatFilterNumber(segment.zoomScale - 1)})*(${amountExpression})`

  return {
    zoomExpression,
    focusXExpression: `0.5+(${formatFilterNumber(segment.focusX - 0.5)})*(${amountExpression})`,
    focusYExpression: `0.5+(${formatFilterNumber(segment.focusY - 0.5)})*(${amountExpression})`,
  }
}

function getForegroundFitSize(framePreset, sourceSize) {
  const sourceWidth = Math.max(0, Number(sourceSize?.width) || 0)
  const sourceHeight = Math.max(0, Number(sourceSize?.height) || 0)
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return null
  }

  const scale = Math.min(framePreset.width / sourceWidth, framePreset.height / sourceHeight)
  return {
    width: Math.max(2, Math.round((sourceWidth * scale) / 2) * 2),
    height: Math.max(2, Math.round((sourceHeight * scale) / 2) * 2),
  }
}

function getZoompanSupersampleSize(fitSize) {
  const maxDimension = Math.max(Number(fitSize?.width) || 0, Number(fitSize?.height) || 0)
  const multiplier = maxDimension > 0 && maxDimension <= 1080 ? 3 : 1
  return {
    width: fitSize.width * multiplier,
    height: fitSize.height * multiplier,
    multiplier,
  }
}

function buildNativeForegroundZoompanScale({ inputLabel, outputLabel, framePreset, motionSegments, sourceSize, frameRate }) {
  const fitSize = getForegroundFitSize(framePreset, sourceSize)
  if (!fitSize) {
    return ''
  }

  const supersampleSize = getZoompanSupersampleSize(fitSize)
  const zoomInputLabel = supersampleSize.multiplier > 1 ? `${outputLabel}_zoom_src` : inputLabel
  const zoompanFrameRate = Math.max(1, Number(frameRate) || 30)
  const timeExpression = `(on/${formatFilterNumber(zoompanFrameRate, 6)})`
  const zoomExpression = buildZoomExpression(motionSegments, timeExpression)
  const focusXExpression = buildFocusExpression(motionSegments, 'focusX', timeExpression)
  const focusYExpression = buildFocusExpression(motionSegments, 'focusY', timeExpression)
  const cropWidthExpression = `iw/(${zoomExpression})`
  const cropHeightExpression = `ih/(${zoomExpression})`
  const xExpression = `min(max(iw*(${focusXExpression})-(${cropWidthExpression})/2,0),iw-(${cropWidthExpression}))`
  const yExpression = `min(max(ih*(${focusYExpression})-(${cropHeightExpression})/2,0),ih-(${cropHeightExpression}))`

  const zoompanFilter = `[${zoomInputLabel}]zoompan=z='${zoomExpression}':x='${xExpression}':y='${yExpression}':d=1:s=${fitSize.width}x${fitSize.height}:fps=${formatFilterNumber(zoompanFrameRate, 3)},setsar=1[${outputLabel}]`
  if (supersampleSize.multiplier <= 1) {
    return zoompanFilter
  }

  return [
    `[${inputLabel}]scale=${supersampleSize.width}:${supersampleSize.height}:flags=fast_bilinear,setsar=1[${zoomInputLabel}]`,
    zoompanFilter,
  ].join(';')
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

export function buildNativeForegroundScale({ inputLabel, outputLabel, framePreset, motionSegments, scaleFlags = 'bicubic+accurate_rnd+full_chroma_int' }) {
  if (!hasSceneMotionSegments(motionSegments)) {
    return `[${inputLabel}]scale=w=${framePreset.width}:h=${framePreset.height}:force_original_aspect_ratio=decrease:flags=${scaleFlags},setsar=1[${outputLabel}]`
  }

  const baseSourceLabel = `${outputLabel}_base_src`
  const zoomSourceLabel = `${outputLabel}_zoom_src`
  const boxLabel = `${outputLabel}_box`
  const zoomLabel = `${outputLabel}_zoom`
  const baseScaleExpression = `min(${framePreset.width}/iw,${framePreset.height}/ih)`
  const singleSegmentExpressions = motionSegments.length === 1
    ? buildSingleSegmentMotionExpressions(motionSegments[0])
    : null
  const zoomExpression = singleSegmentExpressions?.zoomExpression || buildZoomExpression(motionSegments)
  const focusXExpression = singleSegmentExpressions?.focusXExpression || buildFocusExpression(motionSegments, 'focusX')
  const focusYExpression = singleSegmentExpressions?.focusYExpression || buildFocusExpression(motionSegments, 'focusY')
  const zoomWidthExpression = buildNearestEvenExpression(`iw*${baseScaleExpression}*(${zoomExpression})`)
  const xExpression = buildPixelExpression(`if(gte(w,W),min(max(W/2-(${focusXExpression})*w,W-w),0),(W-w)/2)`)
  const yExpression = buildPixelExpression(`if(gte(h,H),min(max(H/2-(${focusYExpression})*h,H-h),0),(H-h)/2)`)

  return [
    `[${inputLabel}]split=2[${baseSourceLabel}][${zoomSourceLabel}]`,
    `[${baseSourceLabel}]scale=w=${framePreset.width}:h=${framePreset.height}:force_original_aspect_ratio=decrease:flags=${scaleFlags},setsar=1,format=yuv444p[${boxLabel}]`,
    `[${zoomSourceLabel}]scale=w='${zoomWidthExpression}':h=-2:eval=frame:flags=${scaleFlags},setsar=1,format=yuv444p[${zoomLabel}]`,
    `[${boxLabel}][${zoomLabel}]overlay=x='${xExpression}':y='${yExpression}':shortest=1:eof_action=pass:eval=frame[${outputLabel}]`,
  ].join(';')
}

export function buildNativeForegroundCropZoomScale({ inputLabel, outputLabel, framePreset, motionSegments, sourceSize = null, frameRate = 30 }) {
  if (!hasSceneMotionSegments(motionSegments)) {
    return buildNativeForegroundScale({ inputLabel, outputLabel, framePreset, motionSegments, scaleFlags: 'fast_bilinear' })
  }

  return buildNativeForegroundZoompanScale({ inputLabel, outputLabel, framePreset, motionSegments, sourceSize, frameRate })
    || buildNativeForegroundScale({ inputLabel, outputLabel, framePreset, motionSegments, scaleFlags: 'fast_bilinear' })
}

export function buildNativeForegroundOverlay({ backgroundLabel, foregroundLabel, outputLabel, motionSegments }) {
  const evalMode = hasSceneMotionSegments(motionSegments) ? ':eval=frame' : ''
  return `[${backgroundLabel}][${foregroundLabel}]overlay=(W-w)/2:(H-h)/2:shortest=1:eof_action=pass${evalMode}[${outputLabel}]`
}
