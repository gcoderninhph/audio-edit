export const DEFAULT_SUBTITLE_FONT_FAMILY = 'Arial'
export const DEFAULT_SUBTITLE_FONT_STACK = 'Arial, "Segoe UI", sans-serif'

let measureContext = null

function getMeasureContext() {
  if (measureContext || typeof document === 'undefined') {
    return measureContext
  }

  const canvas = document.createElement('canvas')
  measureContext = canvas.getContext('2d')
  return measureContext
}

function wrapParagraph(paragraph, context, maxWidthPx) {
  const trimmed = paragraph.trim()
  if (!trimmed) {
    return ['']
  }

  const words = trimmed.split(/\s+/)
  const lines = []
  let currentLine = ''

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word
    if (context.measureText(nextLine).width <= maxWidthPx || !currentLine) {
      currentLine = nextLine
      continue
    }

    lines.push(currentLine)
    currentLine = word
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}

export function buildSubtitleRenderSpec(framePreset, fontFamily = DEFAULT_SUBTITLE_FONT_FAMILY) {
  const fontSizePx = Math.max(26, Math.round(framePreset.width * 0.032))
  const sideMarginPx = Math.round(framePreset.width * 0.08)
  const bottomMarginPx = Math.round(framePreset.height * 0.08)
  const maxWidthPx = framePreset.width - (sideMarginPx * 2)
  const lineHeightPx = Math.round(fontSizePx * 1.25)
  const boxPaddingPx = Math.max(10, Math.round(fontSizePx * 0.34))

  return {
    fontFamily,
    fontSizePx,
    lineHeightPx,
    sideMarginPx,
    bottomMarginPx,
    maxWidthPx,
    boxPaddingPx,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    fontColor: '#ffffff',
    shadowColor: 'rgba(0, 0, 0, 0.8)',
  }
}

export function wrapSubtitleText(text, renderSpec) {
  const normalizedText = String(text || '').trim()
  if (!normalizedText) {
    return ''
  }

  const context = getMeasureContext()
  if (!context) {
    return normalizedText
  }

  context.font = `600 ${renderSpec.fontSizePx}px ${renderSpec.fontFamily}`

  return normalizedText
    .split(/\r?\n/)
    .flatMap((paragraph) => wrapParagraph(paragraph, context, renderSpec.maxWidthPx))
    .join('\n')
}

export function buildPreviewSubtitleStyle(framePreset, renderedStageWidth, fontFamily = DEFAULT_SUBTITLE_FONT_FAMILY) {
  const renderSpec = buildSubtitleRenderSpec(framePreset, fontFamily)
  const safeRenderedWidth = Math.max(1, renderedStageWidth || framePreset.width)
  const scale = safeRenderedWidth / framePreset.width

  return {
    bottom: `${renderSpec.bottomMarginPx * scale}px`,
    maxWidth: `${renderSpec.maxWidthPx * scale}px`,
    padding: `${renderSpec.boxPaddingPx * scale}px`,
    fontSize: `${renderSpec.fontSizePx * scale}px`,
    lineHeight: `${renderSpec.lineHeightPx * scale}px`,
    fontFamily: DEFAULT_SUBTITLE_FONT_STACK,
    fontWeight: 600,
    color: renderSpec.fontColor,
    background: renderSpec.backgroundColor,
    textShadow: `${1 * scale}px ${1 * scale}px ${2 * scale}px ${renderSpec.shadowColor}`,
  }
}