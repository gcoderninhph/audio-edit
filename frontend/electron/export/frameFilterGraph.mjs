import {
  DEFAULT_FRAME_BACKGROUND,
  getFrameBackgroundFillColor,
  getVideoFadePresetById,
  isImageFrameBackground,
  isVideoFadeFrameBackground,
} from '../../src/utils/frameComposer.js'
import {
  buildNativeForegroundOverlay,
  buildNativeForegroundScale,
  hasSceneMotionSegments,
} from './frameMotionFilter.mjs'
import { DEFAULT_NATIVE_FRAME_RATE, normalizeNativeFrameRate } from './nativeFfmpeg.mjs'
import { WATERMARK_TEXT, buildWatermarkMotionSegments } from '../../src/utils/watermarkMotion.js'

function formatSeconds(seconds) {
  return Number(seconds || 0).toFixed(3)
}

function toFfmpegColor(hexColor) {
  return `0x${String(getFrameBackgroundFillColor(hexColor)).replace('#', '')}`
}

export function getNativeBackgroundImagePath(frameBackground) {
  return isImageFrameBackground(frameBackground) && typeof frameBackground.nativeImagePath === 'string'
    ? frameBackground.nativeImagePath
    : ''
}

function isNativeVideoFadeBackground(frameBackground) {
  return isVideoFadeFrameBackground(frameBackground)
}

function formatFilterNumber(value, digits = 2) {
  return Number(value || 0).toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

function buildEnableExpression(events) {
  return events
    .map((event) => `between(t,${formatSeconds(event.start)},${formatSeconds(event.end)})`)
    .join('+')
}

function formatFrameRate(frameRate) {
  return String(normalizeNativeFrameRate(frameRate)).replace(/\.0+$/, '')
}

function buildLinearExpression(segment, axis) {
  const startValue = axis === 'x' ? segment.startX : segment.startY
  const endValue = axis === 'x' ? segment.endX : segment.endY
  const duration = Math.max(0.001, segment.end - segment.start)
  return `${formatFilterNumber(startValue, 6)}+(${formatFilterNumber(endValue - startValue, 6)})*((t-${formatSeconds(segment.start)})/${formatSeconds(duration)})`
}

function buildPiecewiseWatermarkExpression(segments, axis) {
  return segments.reduceRight((expression, segment) => (
    `if(between(t,${formatSeconds(segment.start)},${formatSeconds(segment.end)}),${buildLinearExpression(segment, axis)},${expression})`
  ), axis === 'x' ? formatFilterNumber(segments.at(-1)?.endX || 0.16, 6) : formatFilterNumber(segments.at(-1)?.endY || 0.22, 6))
}

function buildMovingWatermarkFilter(inputLabel, outputLabel, framePreset, timeOffset = 0, duration = 0) {
  const fontSize = Math.max(28, Math.min(88, Math.round(Math.min(framePreset.width, framePreset.height) * 0.06)))
  const margin = Math.max(18, Math.round(fontSize * 0.9))
  const borderWidth = Math.max(2, Math.round(fontSize * 0.08))
  const shadowOffset = Math.max(2, Math.round(fontSize * 0.05))
  const segments = buildWatermarkMotionSegments(timeOffset, Math.max(0.001, duration || 1))
  const xExpression = `${margin}+max(0,w-text_w-${margin * 2})*(${buildPiecewiseWatermarkExpression(segments, 'x')})`
  const yExpression = `${margin}+max(0,h-text_h-${margin * 2})*(${buildPiecewiseWatermarkExpression(segments, 'y')})`

  return `[${inputLabel}]drawtext=text='${WATERMARK_TEXT}':font='Arial':fontsize=${fontSize}:fontcolor=white@0.42:borderw=${borderWidth}:bordercolor=black@0.38:shadowcolor=black@0.35:shadowx=${shadowOffset}:shadowy=${shadowOffset}:x='${xExpression}':y='${yExpression}'[${outputLabel}]`
}

export function buildFrameFilter(framePreset, frameBackground, overlayAssets, motionSegments, { frameRate = DEFAULT_NATIVE_FRAME_RATE, timeOffset = 0, duration = 0 } = {}) {
  const safeOverlayAssets = Array.isArray(overlayAssets) ? overlayAssets : []
  const safeMotionSegments = Array.isArray(motionSegments) ? motionSegments : []
  const usesMotionSegments = hasSceneMotionSegments(safeMotionSegments)
  const stableMotionFormat = usesMotionSegments ? ',format=yuv444p' : ''
  const nativeFrameRate = formatFrameRate(frameRate)
  const backgroundImagePath = getNativeBackgroundImagePath(frameBackground)
  const fadePreset = getVideoFadePresetById(frameBackground?.presetId)
  const sourceLabel = 'src'
  const filterChain = [`[0:v]fps=${nativeFrameRate},setpts=N/(${nativeFrameRate}*TB)${stableMotionFormat}[${sourceLabel}]`]

  filterChain.push(...(backgroundImagePath
    ? [
      `[1:v]scale=w=${framePreset.width}:h=${framePreset.height}:force_original_aspect_ratio=increase,crop=${framePreset.width}:${framePreset.height},setsar=1${stableMotionFormat}[bg]`,
      buildNativeForegroundScale({ inputLabel: sourceLabel, outputLabel: 'fg', framePreset, motionSegments: safeMotionSegments }),
      buildNativeForegroundOverlay({ backgroundLabel: 'bg', foregroundLabel: 'fg', outputLabel: 'v0', framePreset, motionSegments: safeMotionSegments }),
    ]
    : isNativeVideoFadeBackground(frameBackground)
      ? [
        `[${sourceLabel}]split=2[bgsrc][fgsrc]`,
        `[bgsrc]scale=w=${framePreset.width}:h=${framePreset.height}:force_original_aspect_ratio=increase,crop=${framePreset.width}:${framePreset.height},boxblur=${fadePreset.nativeBlur},eq=brightness=${formatFilterNumber(fadePreset.nativeBrightness, 3)}:saturation=${formatFilterNumber(fadePreset.nativeSaturation, 3)},setsar=1${stableMotionFormat}[bg]`,
        `[bg]drawbox=x=0:y=0:w=iw:h=ih:color=${toFfmpegColor(DEFAULT_FRAME_BACKGROUND)}@${formatFilterNumber(fadePreset.nativeOverlayOpacity, 3)}:t=fill${stableMotionFormat}[bgdim]`,
        buildNativeForegroundScale({ inputLabel: 'fgsrc', outputLabel: 'fg', framePreset, motionSegments: safeMotionSegments }),
        buildNativeForegroundOverlay({ backgroundLabel: 'bgdim', foregroundLabel: 'fg', outputLabel: 'v0', framePreset, motionSegments: safeMotionSegments }),
      ]
      : usesMotionSegments ? [
        `color=c=${toFfmpegColor(frameBackground)}:s=${framePreset.width}x${framePreset.height}:r=${nativeFrameRate},format=yuv444p[bg]`,
        buildNativeForegroundScale({ inputLabel: sourceLabel, outputLabel: 'fg', framePreset, motionSegments: safeMotionSegments }),
        buildNativeForegroundOverlay({ backgroundLabel: 'bg', foregroundLabel: 'fg', outputLabel: 'v0', framePreset, motionSegments: safeMotionSegments }),
      ] : [
        `[${sourceLabel}]scale=w=${framePreset.width}:h=${framePreset.height}:force_original_aspect_ratio=decrease,pad=${framePreset.width}:${framePreset.height}:(ow-iw)/2:(oh-ih)/2:${toFfmpegColor(frameBackground)}[v0]`,
      ]))
  const subtitleInputOffset = backgroundImagePath ? 2 : 1

  let currentLabel = 'v0'
  filterChain.push(buildMovingWatermarkFilter(currentLabel, 'vwm', framePreset, timeOffset, duration))
  currentLabel = 'vwm'

  safeOverlayAssets.forEach((asset, index) => {
    const nextLabel = `v${index + 1}`
    filterChain.push(
      `[${currentLabel}][${index + subtitleInputOffset}:v]overlay=${asset.x}:${asset.y}:shortest=1:eof_action=pass:repeatlast=0:enable='${buildEnableExpression(asset.events)}'[${nextLabel}]`,
    )
    currentLabel = nextLabel
  })

  filterChain.push(`[${currentLabel}]fps=${nativeFrameRate},setpts=N/(${nativeFrameRate}*TB),format=yuv420p[vout]`)

  return {
    filterComplex: filterChain.join(';'),
    outputLabel: '[vout]',
  }
}