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

export function buildFrameFilter(framePreset, frameBackground, overlayAssets, motionSegments, { frameRate = DEFAULT_NATIVE_FRAME_RATE } = {}) {
  const safeOverlayAssets = Array.isArray(overlayAssets) ? overlayAssets : []
  const safeMotionSegments = Array.isArray(motionSegments) ? motionSegments : []
  const nativeFrameRate = formatFrameRate(frameRate)
  const backgroundImagePath = getNativeBackgroundImagePath(frameBackground)
  const fadePreset = getVideoFadePresetById(frameBackground?.presetId)
  const sourceLabel = 'src'
  const filterChain = [`[0:v]fps=${nativeFrameRate},setpts=N/(${nativeFrameRate}*TB)[${sourceLabel}]`]

  filterChain.push(...(backgroundImagePath
    ? [
      `[1:v]scale=w=${framePreset.width}:h=${framePreset.height}:force_original_aspect_ratio=increase,crop=${framePreset.width}:${framePreset.height},setsar=1[bg]`,
      buildNativeForegroundScale({ inputLabel: sourceLabel, outputLabel: 'fg', framePreset, motionSegments: safeMotionSegments }),
      buildNativeForegroundOverlay({ backgroundLabel: 'bg', foregroundLabel: 'fg', outputLabel: 'v0', framePreset, motionSegments: safeMotionSegments }),
    ]
    : isNativeVideoFadeBackground(frameBackground)
      ? [
        `[${sourceLabel}]split=2[bgsrc][fgsrc]`,
        `[bgsrc]scale=w=${framePreset.width}:h=${framePreset.height}:force_original_aspect_ratio=increase,crop=${framePreset.width}:${framePreset.height},boxblur=${fadePreset.nativeBlur},eq=brightness=${formatFilterNumber(fadePreset.nativeBrightness, 3)}:saturation=${formatFilterNumber(fadePreset.nativeSaturation, 3)},setsar=1[bg]`,
        `[bg]drawbox=x=0:y=0:w=iw:h=ih:color=${toFfmpegColor(DEFAULT_FRAME_BACKGROUND)}@${formatFilterNumber(fadePreset.nativeOverlayOpacity, 3)}:t=fill[bgdim]`,
        buildNativeForegroundScale({ inputLabel: 'fgsrc', outputLabel: 'fg', framePreset, motionSegments: safeMotionSegments }),
        buildNativeForegroundOverlay({ backgroundLabel: 'bgdim', foregroundLabel: 'fg', outputLabel: 'v0', framePreset, motionSegments: safeMotionSegments }),
      ]
      : hasSceneMotionSegments(safeMotionSegments) ? [
        `color=c=${toFfmpegColor(frameBackground)}:s=${framePreset.width}x${framePreset.height}:r=${nativeFrameRate}[bg]`,
        buildNativeForegroundScale({ inputLabel: sourceLabel, outputLabel: 'fg', framePreset, motionSegments: safeMotionSegments }),
        buildNativeForegroundOverlay({ backgroundLabel: 'bg', foregroundLabel: 'fg', outputLabel: 'v0', framePreset, motionSegments: safeMotionSegments }),
      ] : [
        `[${sourceLabel}]scale=w=${framePreset.width}:h=${framePreset.height}:force_original_aspect_ratio=decrease,pad=${framePreset.width}:${framePreset.height}:(ow-iw)/2:(oh-ih)/2:${toFfmpegColor(frameBackground)}[v0]`,
      ]))
  const subtitleInputOffset = backgroundImagePath ? 2 : 1

  let currentLabel = 'v0'
  safeOverlayAssets.forEach((asset, index) => {
    const nextLabel = `v${index + 1}`
    filterChain.push(
      `[${currentLabel}][${index + subtitleInputOffset}:v]overlay=${asset.x}:${asset.y}:shortest=1:eof_action=pass:repeatlast=0:enable='${buildEnableExpression(asset.events)}'[${nextLabel}]`,
    )
    currentLabel = nextLabel
  })

  filterChain.push(`[${currentLabel}]fps=${nativeFrameRate},setpts=N/(${nativeFrameRate}*TB)[vout]`)

  return {
    filterComplex: filterChain.join(';'),
    outputLabel: '[vout]',
  }
}