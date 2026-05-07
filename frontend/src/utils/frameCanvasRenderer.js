import { buildSubtitleRenderSpec, DEFAULT_SUBTITLE_FONT_FAMILY, wrapSubtitleText } from './subtitleRenderModel'

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

export function buildSubtitleCardLayout(context, subtitleText, framePreset, fontFamily = DEFAULT_SUBTITLE_FONT_FAMILY) {
  if (!subtitleText) {
    return null
  }

  const renderSpec = buildSubtitleRenderSpec(framePreset, fontFamily)
  const wrappedText = wrapSubtitleText(subtitleText, renderSpec)
  const lines = wrappedText.split(/\r?\n/).filter(Boolean)
  if (lines.length === 0) {
    return null
  }

  context.font = `600 ${renderSpec.fontSizePx}px ${fontFamily}`

  const textWidths = lines.map((line) => context.measureText(line).width)
  const textWidth = Math.max(...textWidths, 0)
  const boxWidth = Math.min(renderSpec.maxWidthPx, textWidth + (renderSpec.boxPaddingPx * 2.6))
  const boxHeight = (lines.length * renderSpec.lineHeightPx) + (renderSpec.boxPaddingPx * 2)
  const boxX = (framePreset.width - boxWidth) / 2
  const boxY = framePreset.height - renderSpec.bottomMarginPx - boxHeight

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

  context.save()
  context.font = `600 ${layout.renderSpec.fontSizePx}px ${layout.renderSpec.fontFamily}`
  context.textAlign = 'center'
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
    context.fillText(line, (layout.frameWidth / 2) - offsetX, lineY)
  })

  context.restore()
}

function drawSubtitleCard(context, subtitleText, framePreset, fontFamily = DEFAULT_SUBTITLE_FONT_FAMILY) {
  renderSubtitleCardLayout(
    context,
    buildSubtitleCardLayout(context, subtitleText, framePreset, fontFamily),
  )
}

export function drawFrameComposition(context, {
  framePreset,
  frameBackground,
  videoElement,
  subtitleText,
  fontFamily = DEFAULT_SUBTITLE_FONT_FAMILY,
}) {
  context.save()
  context.clearRect(0, 0, framePreset.width, framePreset.height)
  context.fillStyle = frameBackground
  context.fillRect(0, 0, framePreset.width, framePreset.height)

  if (videoElement && videoElement.readyState >= 2) {
    const layout = getContainedVideoLayout(framePreset, videoElement.videoWidth, videoElement.videoHeight)
    context.drawImage(videoElement, layout.x, layout.y, layout.width, layout.height)
  }

  drawSubtitleCard(context, subtitleText, framePreset, fontFamily)
  context.restore()
}