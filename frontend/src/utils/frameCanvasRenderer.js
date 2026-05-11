import {
  DEFAULT_FRAME_BACKGROUND,
  getFrameBackgroundFillColor,
  getVideoFadePresetById,
  isImageFrameBackground,
  isVideoFadeFrameBackground,
  sanitizeFrameBackground,
} from './frameComposer'
import {
  buildSubtitleRenderSpec,
  DEFAULT_SUBTITLE_FONT_FAMILY,
  DEFAULT_SUBTITLE_SETTINGS,
  resolveSubtitleCardPosition,
  wrapSubtitleText,
} from './subtitleRenderModel'

const backgroundImageCache = new Map()

function drawRoundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2)

  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

export function getContainedVideoLayout(framePreset, sourceWidth, sourceHeight) {
  const safeSourceWidth = Math.max(1, sourceWidth || framePreset.width)
  const safeSourceHeight = Math.max(1, sourceHeight || framePreset.height)
  const scale = Math.min(framePreset.width / safeSourceWidth, framePreset.height / safeSourceHeight)
  const width = safeSourceWidth * scale
  const height = safeSourceHeight * scale

  return {
    x: (framePreset.width - width) / 2,
    y: (framePreset.height - height) / 2,
    width,
    height,
  }
}

function getCoverImageLayout(framePreset, sourceWidth, sourceHeight) {
  const safeSourceWidth = Math.max(1, sourceWidth || framePreset.width)
  const safeSourceHeight = Math.max(1, sourceHeight || framePreset.height)
  const scale = Math.max(framePreset.width / safeSourceWidth, framePreset.height / safeSourceHeight)
  const width = safeSourceWidth * scale
  const height = safeSourceHeight * scale

  return {
    x: (framePreset.width - width) / 2,
    y: (framePreset.height - height) / 2,
    width,
    height,
  }
}

function canDrawVideoFrame(videoElement) {
  return Boolean(
    videoElement
      && videoElement.readyState >= 2
      && (videoElement.videoWidth || 0) > 0
      && (videoElement.videoHeight || 0) > 0,
  )
}

export function loadFrameBackgroundImage(frameBackground) {
  const normalizedBackground = sanitizeFrameBackground(frameBackground)
  if (!isImageFrameBackground(normalizedBackground)) {
    return Promise.resolve(null)
  }

  const cachedPromise = backgroundImageCache.get(normalizedBackground.dataUrl)
  if (cachedPromise) {
    return cachedPromise
  }

  const nextPromise = new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => {
      backgroundImageCache.delete(normalizedBackground.dataUrl)
      reject(new Error('Không thể tải ảnh nền bìa.'))
    }
    image.src = normalizedBackground.dataUrl
  })

  backgroundImageCache.set(normalizedBackground.dataUrl, nextPromise)
  return nextPromise
}

export function buildSubtitleCardLayout(
  context,
  subtitleText,
  framePreset,
  fontFamily = DEFAULT_SUBTITLE_FONT_FAMILY,
  subtitleSettings = DEFAULT_SUBTITLE_SETTINGS,
) {
  if (!subtitleText) {
    return null
  }

  const renderSpec = buildSubtitleRenderSpec(framePreset, fontFamily, subtitleSettings)
  const wrappedText = wrapSubtitleText(subtitleText, renderSpec)
  const lines = wrappedText.split(/\r?\n/).filter(Boolean)
  if (lines.length === 0) {
    return null
  }

  context.font = `600 ${renderSpec.fontSizePx}px ${renderSpec.canvasFontFamily}`

  const textWidths = lines.map((line) => context.measureText(line).width)
  const textWidth = Math.max(...textWidths, 0)
  const boxWidth = Math.min(renderSpec.maxWidthPx, textWidth + (renderSpec.boxPaddingPx * 2.6))
  const boxHeight = (lines.length * renderSpec.lineHeightPx) + (renderSpec.boxPaddingPx * 2)
  const { boxX, boxY } = resolveSubtitleCardPosition(framePreset, renderSpec, boxWidth, boxHeight)

  return {
    boxHeight,
    boxWidth,
    boxX,
    boxY,
    frameWidth: framePreset.width,
    lines,
    renderSpec,
  }
}

export function renderSubtitleCardLayout(context, layout, { offsetX = 0, offsetY = 0 } = {}) {
  if (!layout) {
    return
  }

  const boxX = layout.boxX - offsetX
  const boxY = layout.boxY - offsetY
  const horizontalTextPadding = layout.renderSpec.boxPaddingPx * 1.3
  const horizontalAlign = layout.renderSpec.horizontalAlign === 'left'
    ? 'left'
    : layout.renderSpec.horizontalAlign === 'right'
      ? 'right'
      : 'center'
  const textX = horizontalAlign === 'left'
    ? boxX + horizontalTextPadding
    : horizontalAlign === 'right'
      ? boxX + layout.boxWidth - horizontalTextPadding
      : boxX + (layout.boxWidth / 2)

  context.save()
  context.font = `600 ${layout.renderSpec.fontSizePx}px ${layout.renderSpec.canvasFontFamily}`
  context.textAlign = horizontalAlign
  context.textBaseline = 'middle'

  context.fillStyle = layout.renderSpec.backgroundColor
  drawRoundedRect(context, boxX, boxY, layout.boxWidth, layout.boxHeight, layout.renderSpec.boxPaddingPx)
  context.fill()

  context.fillStyle = layout.renderSpec.fontColor
  context.shadowColor = layout.renderSpec.shadowColor
  context.shadowBlur = 2
  context.shadowOffsetX = 1
  context.shadowOffsetY = 1

  layout.lines.forEach((line, index) => {
    const lineY = boxY + layout.renderSpec.boxPaddingPx + (layout.renderSpec.lineHeightPx * index) + (layout.renderSpec.lineHeightPx / 2)
    context.fillText(line, textX, lineY)
  })

  context.restore()
}

function drawSubtitleCard(
  context,
  subtitleText,
  framePreset,
  fontFamily = DEFAULT_SUBTITLE_FONT_FAMILY,
  subtitleSettings = DEFAULT_SUBTITLE_SETTINGS,
) {
  renderSubtitleCardLayout(
    context,
    buildSubtitleCardLayout(context, subtitleText, framePreset, fontFamily, subtitleSettings),
  )
}

function drawVideoFadeBackground(context, framePreset, frameBackground, videoElement) {
  if (!canDrawVideoFrame(videoElement)) {
    return false
  }

  const fadePreset = getVideoFadePresetById(frameBackground?.presetId)
  const layout = getCoverImageLayout(framePreset, videoElement.videoWidth, videoElement.videoHeight)
  const vignetteGradient = context.createRadialGradient(
    framePreset.width / 2,
    framePreset.height / 2,
    Math.min(framePreset.width, framePreset.height) * 0.16,
    framePreset.width / 2,
    framePreset.height / 2,
    Math.max(framePreset.width, framePreset.height) * 0.76,
  )
  vignetteGradient.addColorStop(0, 'rgba(5, 8, 22, 0.04)')
  vignetteGradient.addColorStop(1, `rgba(5, 8, 22, ${fadePreset.previewVignetteOpacity})`)

  const verticalFade = context.createLinearGradient(0, 0, 0, framePreset.height)
  verticalFade.addColorStop(0, `rgba(5, 8, 22, ${fadePreset.previewTopShadeOpacity})`)
  verticalFade.addColorStop(0.45, 'rgba(5, 8, 22, 0.1)')
  verticalFade.addColorStop(1, `rgba(5, 8, 22, ${fadePreset.previewBottomShadeOpacity})`)

  context.save()
  context.fillStyle = DEFAULT_FRAME_BACKGROUND
  context.fillRect(0, 0, framePreset.width, framePreset.height)
  context.filter = `blur(${fadePreset.previewBlurPx}px) saturate(${fadePreset.previewSaturation}) brightness(${fadePreset.previewBrightness})`
  context.drawImage(videoElement, layout.x, layout.y, layout.width, layout.height)
  context.filter = 'none'
  context.fillStyle = `rgba(5, 8, 22, ${fadePreset.previewOverlayOpacity})`
  context.fillRect(0, 0, framePreset.width, framePreset.height)
  context.fillStyle = verticalFade
  context.fillRect(0, 0, framePreset.width, framePreset.height)
  context.fillStyle = vignetteGradient
  context.fillRect(0, 0, framePreset.width, framePreset.height)
  context.restore()

  return true
}

function drawFrameBackground(context, framePreset, frameBackground, backgroundImage, videoElement) {
  context.fillStyle = getFrameBackgroundFillColor(frameBackground) || DEFAULT_FRAME_BACKGROUND
  context.fillRect(0, 0, framePreset.width, framePreset.height)

  if (isVideoFadeFrameBackground(frameBackground)) {
    drawVideoFadeBackground(context, framePreset, frameBackground, videoElement)
    return
  }

  if (!backgroundImage) {
    return
  }

  const layout = getCoverImageLayout(framePreset, backgroundImage.naturalWidth, backgroundImage.naturalHeight)
  context.drawImage(backgroundImage, layout.x, layout.y, layout.width, layout.height)
}

export function drawFrameComposition(context, {
  framePreset,
  frameBackground,
  backgroundImage = null,
  videoElement,
  subtitleText,
  fontFamily = DEFAULT_SUBTITLE_FONT_FAMILY,
  subtitleSettings = DEFAULT_SUBTITLE_SETTINGS,
}) {
  context.save()
  context.clearRect(0, 0, framePreset.width, framePreset.height)
  drawFrameBackground(context, framePreset, frameBackground, backgroundImage, videoElement)

  if (canDrawVideoFrame(videoElement)) {
    const layout = getContainedVideoLayout(framePreset, videoElement.videoWidth, videoElement.videoHeight)
    context.drawImage(videoElement, layout.x, layout.y, layout.width, layout.height)
  }

  drawSubtitleCard(context, subtitleText, framePreset, fontFamily, subtitleSettings)
  context.restore()
}