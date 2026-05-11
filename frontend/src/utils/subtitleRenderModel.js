export const DEFAULT_SUBTITLE_FONT_FAMILY = 'Arial'
export const DEFAULT_SUBTITLE_FONT_STACK = 'Arial, "Segoe UI", sans-serif'
export const DEFAULT_SUBTITLE_FONT_COLOR = '#FFFFFF'
export const DEFAULT_SUBTITLE_BACKGROUND_COLOR = '#000000'
export const DEFAULT_SUBTITLE_BACKGROUND_OPACITY = 0.72
export const DEFAULT_SUBTITLE_SETTINGS = Object.freeze({
  fontSizeScale: 1,
  anchor: 'bottom-center',
  fontFamily: DEFAULT_SUBTITLE_FONT_FAMILY,
  fontColor: DEFAULT_SUBTITLE_FONT_COLOR,
  backgroundColor: DEFAULT_SUBTITLE_BACKGROUND_COLOR,
  backgroundOpacity: DEFAULT_SUBTITLE_BACKGROUND_OPACITY,
})

export const SUBTITLE_FONT_OPTIONS = Object.freeze([
  {
    id: 'Arial',
    label: 'Arial',
    canvasFamily: 'Arial, "Segoe UI", sans-serif',
    cssStack: 'Arial, "Segoe UI", sans-serif',
  },
  {
    id: 'Arial Black',
    label: 'Arial Black',
    canvasFamily: '"Arial Black", Arial, sans-serif',
    cssStack: '"Arial Black", Arial, sans-serif',
  },
  {
    id: 'Book Antiqua',
    label: 'Book Antiqua',
    canvasFamily: '"Book Antiqua", Palatino, serif',
    cssStack: '"Book Antiqua", Palatino, serif',
  },
  {
    id: 'Calibri',
    label: 'Calibri',
    canvasFamily: 'Calibri, "Segoe UI", sans-serif',
    cssStack: 'Calibri, "Segoe UI", sans-serif',
  },
  {
    id: 'Cambria',
    label: 'Cambria',
    canvasFamily: 'Cambria, Georgia, serif',
    cssStack: 'Cambria, Georgia, serif',
  },
  {
    id: 'Candara',
    label: 'Candara',
    canvasFamily: 'Candara, "Segoe UI", sans-serif',
    cssStack: 'Candara, "Segoe UI", sans-serif',
  },
  {
    id: 'Century Gothic',
    label: 'Century Gothic',
    canvasFamily: '"Century Gothic", Futura, sans-serif',
    cssStack: '"Century Gothic", Futura, sans-serif',
  },
  {
    id: 'Comic Sans MS',
    label: 'Comic Sans',
    canvasFamily: '"Comic Sans MS", "Trebuchet MS", cursive',
    cssStack: '"Comic Sans MS", "Trebuchet MS", cursive',
  },
  {
    id: 'Consolas',
    label: 'Consolas',
    canvasFamily: 'Consolas, "Courier New", monospace',
    cssStack: 'Consolas, "Courier New", monospace',
  },
  {
    id: 'Constantia',
    label: 'Constantia',
    canvasFamily: 'Constantia, Georgia, serif',
    cssStack: 'Constantia, Georgia, serif',
  },
  {
    id: 'Corbel',
    label: 'Corbel',
    canvasFamily: 'Corbel, Arial, sans-serif',
    cssStack: 'Corbel, Arial, sans-serif',
  },
  {
    id: 'Courier New',
    label: 'Courier New',
    canvasFamily: '"Courier New", monospace',
    cssStack: '"Courier New", monospace',
  },
  {
    id: 'Franklin Gothic Medium',
    label: 'Franklin Gothic',
    canvasFamily: '"Franklin Gothic Medium", Arial, sans-serif',
    cssStack: '"Franklin Gothic Medium", Arial, sans-serif',
  },
  {
    id: 'Garamond',
    label: 'Garamond',
    canvasFamily: 'Garamond, Georgia, serif',
    cssStack: 'Garamond, Georgia, serif',
  },
  {
    id: 'Georgia',
    label: 'Georgia',
    canvasFamily: 'Georgia, serif',
    cssStack: 'Georgia, serif',
  },
  {
    id: 'Impact',
    label: 'Impact',
    canvasFamily: 'Impact, Haettenschweiler, sans-serif',
    cssStack: 'Impact, Haettenschweiler, sans-serif',
  },
  {
    id: 'Lucida Console',
    label: 'Lucida Console',
    canvasFamily: '"Lucida Console", Monaco, monospace',
    cssStack: '"Lucida Console", Monaco, monospace',
  },
  {
    id: 'Lucida Sans Unicode',
    label: 'Lucida Sans',
    canvasFamily: '"Lucida Sans Unicode", "Lucida Grande", sans-serif',
    cssStack: '"Lucida Sans Unicode", "Lucida Grande", sans-serif',
  },
  {
    id: 'Palatino Linotype',
    label: 'Palatino',
    canvasFamily: '"Palatino Linotype", Palatino, serif',
    cssStack: '"Palatino Linotype", Palatino, serif',
  },
  {
    id: 'Segoe UI',
    label: 'Segoe UI',
    canvasFamily: '"Segoe UI", Arial, sans-serif',
    cssStack: '"Segoe UI", Arial, sans-serif',
  },
  {
    id: 'Tahoma',
    label: 'Tahoma',
    canvasFamily: 'Tahoma, Verdana, sans-serif',
    cssStack: 'Tahoma, Verdana, sans-serif',
  },
  {
    id: 'Times New Roman',
    label: 'Times New Roman',
    canvasFamily: '"Times New Roman", serif',
    cssStack: '"Times New Roman", serif',
  },
  {
    id: 'Trebuchet MS',
    label: 'Trebuchet',
    canvasFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
    cssStack: '"Trebuchet MS", "Segoe UI", sans-serif',
  },
  {
    id: 'Verdana',
    label: 'Verdana',
    canvasFamily: 'Verdana, Geneva, sans-serif',
    cssStack: 'Verdana, Geneva, sans-serif',
  },
])

export const SUBTITLE_ANCHOR_OPTIONS = Object.freeze([
  { id: 'top-left', label: 'Top left', horizontalAlign: 'left', verticalAlign: 'top', assAlignment: 7 },
  { id: 'top-center', label: 'Top center', horizontalAlign: 'center', verticalAlign: 'top', assAlignment: 8 },
  { id: 'top-right', label: 'Top right', horizontalAlign: 'right', verticalAlign: 'top', assAlignment: 9 },
  { id: 'middle-left', label: 'Middle left', horizontalAlign: 'left', verticalAlign: 'middle', assAlignment: 4 },
  { id: 'middle-center', label: 'Center', horizontalAlign: 'center', verticalAlign: 'middle', assAlignment: 5 },
  { id: 'middle-right', label: 'Middle right', horizontalAlign: 'right', verticalAlign: 'middle', assAlignment: 6 },
  { id: 'bottom-left', label: 'Bottom left', horizontalAlign: 'left', verticalAlign: 'bottom', assAlignment: 1 },
  { id: 'bottom-center', label: 'Bottom center', horizontalAlign: 'center', verticalAlign: 'bottom', assAlignment: 2 },
  { id: 'bottom-right', label: 'Bottom right', horizontalAlign: 'right', verticalAlign: 'bottom', assAlignment: 3 },
])

const SUBTITLE_ANCHORS_BY_ID = new Map(SUBTITLE_ANCHOR_OPTIONS.map((option) => [option.id, option]))
const SUBTITLE_FONTS_BY_ID = new Map(SUBTITLE_FONT_OPTIONS.map((option) => [option.id, option]))
const MIN_SUBTITLE_FONT_SCALE = 0.6
const MAX_SUBTITLE_FONT_SCALE = 1.8
const MIN_SUBTITLE_BACKGROUND_OPACITY = 0
const MAX_SUBTITLE_BACKGROUND_OPACITY = 1

let measureContext = null

function clampSubtitleFontScale(value) {
  const normalizedValue = Number.isFinite(value) ? value : DEFAULT_SUBTITLE_SETTINGS.fontSizeScale
  return Math.max(MIN_SUBTITLE_FONT_SCALE, Math.min(MAX_SUBTITLE_FONT_SCALE, normalizedValue))
}

function clampSubtitleBackgroundOpacity(value) {
  const normalizedValue = Number.isFinite(value) ? value : DEFAULT_SUBTITLE_SETTINGS.backgroundOpacity
  return Math.max(MIN_SUBTITLE_BACKGROUND_OPACITY, Math.min(MAX_SUBTITLE_BACKGROUND_OPACITY, normalizedValue))
}

function normalizeHexColor(value, fallback) {
  const normalizedValue = String(value || '').trim()
  const match = normalizedValue.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) {
    return fallback
  }

  const rawHex = match[1].toUpperCase()
  if (rawHex.length === 3) {
    return `#${rawHex.split('').map((char) => `${char}${char}`).join('')}`
  }

  return `#${rawHex}`
}

function hexToRgb(hexColor) {
  const normalizedHex = normalizeHexColor(hexColor, DEFAULT_SUBTITLE_FONT_COLOR)
  const rgb = normalizedHex.slice(1)
  return {
    red: parseInt(rgb.slice(0, 2), 16),
    green: parseInt(rgb.slice(2, 4), 16),
    blue: parseInt(rgb.slice(4, 6), 16),
  }
}

function buildRgbaColor(hexColor, opacity = 1) {
  const { red, green, blue } = hexToRgb(hexColor)
  return `rgba(${red}, ${green}, ${blue}, ${clampSubtitleBackgroundOpacity(opacity)})`
}

export function getSubtitleAnchorOption(anchorId = DEFAULT_SUBTITLE_SETTINGS.anchor) {
  return SUBTITLE_ANCHORS_BY_ID.get(anchorId) || SUBTITLE_ANCHORS_BY_ID.get(DEFAULT_SUBTITLE_SETTINGS.anchor)
}

export function getSubtitleFontOption(fontFamily = DEFAULT_SUBTITLE_SETTINGS.fontFamily) {
  return SUBTITLE_FONTS_BY_ID.get(fontFamily) || SUBTITLE_FONTS_BY_ID.get(DEFAULT_SUBTITLE_FONT_FAMILY)
}

export function normalizeSubtitleSettings(subtitleSettings = DEFAULT_SUBTITLE_SETTINGS) {
  return {
    fontSizeScale: clampSubtitleFontScale(subtitleSettings?.fontSizeScale),
    anchor: getSubtitleAnchorOption(subtitleSettings?.anchor).id,
    fontFamily: getSubtitleFontOption(subtitleSettings?.fontFamily).id,
    fontColor: normalizeHexColor(subtitleSettings?.fontColor, DEFAULT_SUBTITLE_FONT_COLOR),
    backgroundColor: normalizeHexColor(subtitleSettings?.backgroundColor, DEFAULT_SUBTITLE_BACKGROUND_COLOR),
    backgroundOpacity: clampSubtitleBackgroundOpacity(subtitleSettings?.backgroundOpacity),
  }
}

export function serializeSubtitleSettings(subtitleSettings = DEFAULT_SUBTITLE_SETTINGS) {
  const normalizedSettings = normalizeSubtitleSettings(subtitleSettings)
  return [
    normalizedSettings.fontSizeScale.toFixed(2),
    normalizedSettings.anchor,
    normalizedSettings.fontFamily,
    normalizedSettings.fontColor,
    normalizedSettings.backgroundColor,
    normalizedSettings.backgroundOpacity.toFixed(2),
  ].join(':')
}

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

export function buildSubtitleRenderSpec(
  framePreset,
  fontFamily = DEFAULT_SUBTITLE_FONT_FAMILY,
  subtitleSettings = DEFAULT_SUBTITLE_SETTINGS,
) {
  const normalizedSettings = normalizeSubtitleSettings(subtitleSettings)
  const anchorOption = getSubtitleAnchorOption(normalizedSettings.anchor)
  const fontOption = getSubtitleFontOption(normalizedSettings.fontFamily || fontFamily)
  const baseFontSizePx = Math.max(26, Math.round(framePreset.width * 0.032))
  const fontSizePx = Math.max(18, Math.round(baseFontSizePx * normalizedSettings.fontSizeScale))
  const sideMarginPx = Math.round(framePreset.width * 0.08)
  const bottomMarginPx = Math.round(framePreset.height * 0.08)
  const topMarginPx = Math.round(framePreset.height * 0.08)
  const maxWidthPx = framePreset.width - (sideMarginPx * 2)
  const lineHeightPx = Math.round(fontSizePx * 1.25)
  const boxPaddingPx = Math.max(10, Math.round(fontSizePx * 0.34))

  return {
    anchor: anchorOption.id,
    assAlignment: anchorOption.assAlignment,
    fontFamily: fontOption.id,
    canvasFontFamily: fontOption.canvasFamily,
    previewFontStack: fontOption.cssStack,
    fontSizeScale: normalizedSettings.fontSizeScale,
    fontSizePx,
    fontColor: normalizedSettings.fontColor,
    fontColorHex: normalizedSettings.fontColor,
    horizontalAlign: anchorOption.horizontalAlign,
    lineHeightPx,
    sideMarginPx,
    bottomMarginPx,
    topMarginPx,
    maxWidthPx,
    boxPaddingPx,
    backgroundColor: buildRgbaColor(normalizedSettings.backgroundColor, normalizedSettings.backgroundOpacity),
    backgroundColorHex: normalizedSettings.backgroundColor,
    backgroundOpacity: normalizedSettings.backgroundOpacity,
    shadowColor: 'rgba(0, 0, 0, 0.8)',
    verticalAlign: anchorOption.verticalAlign,
  }
}

export function resolveSubtitleCardPosition(framePreset, renderSpec, boxWidth, boxHeight) {
  const maxX = Math.max(0, framePreset.width - boxWidth)
  const maxY = Math.max(0, framePreset.height - boxHeight)

  let boxX = (framePreset.width - boxWidth) / 2
  if (renderSpec.horizontalAlign === 'left') {
    boxX = renderSpec.sideMarginPx
  } else if (renderSpec.horizontalAlign === 'right') {
    boxX = framePreset.width - renderSpec.sideMarginPx - boxWidth
  }

  let boxY = framePreset.height - renderSpec.bottomMarginPx - boxHeight
  if (renderSpec.verticalAlign === 'top') {
    boxY = renderSpec.topMarginPx
  } else if (renderSpec.verticalAlign === 'middle') {
    boxY = (framePreset.height - boxHeight) / 2
  }

  return {
    boxX: Math.max(0, Math.min(maxX, boxX)),
    boxY: Math.max(0, Math.min(maxY, boxY)),
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

  context.font = `600 ${renderSpec.fontSizePx}px ${renderSpec.canvasFontFamily}`

  return normalizedText
    .split(/\r?\n/)
    .flatMap((paragraph) => wrapParagraph(paragraph, context, renderSpec.maxWidthPx))
    .join('\n')
}

export function buildPreviewSubtitleStyle(
  framePreset,
  renderedStageWidth,
  fontFamily = DEFAULT_SUBTITLE_FONT_FAMILY,
  subtitleSettings = DEFAULT_SUBTITLE_SETTINGS,
) {
  const renderSpec = buildSubtitleRenderSpec(framePreset, fontFamily, subtitleSettings)
  const safeRenderedWidth = Math.max(1, renderedStageWidth || framePreset.width)
  const scale = safeRenderedWidth / framePreset.width
  const transformParts = []
  const anchorStyle = {}

  if (renderSpec.horizontalAlign === 'left') {
    anchorStyle.left = `${renderSpec.sideMarginPx * scale}px`
  } else if (renderSpec.horizontalAlign === 'right') {
    anchorStyle.right = `${renderSpec.sideMarginPx * scale}px`
  } else {
    anchorStyle.left = '50%'
    transformParts.push('translateX(-50%)')
  }

  if (renderSpec.verticalAlign === 'top') {
    anchorStyle.top = `${renderSpec.topMarginPx * scale}px`
  } else if (renderSpec.verticalAlign === 'middle') {
    anchorStyle.top = '50%'
    transformParts.push('translateY(-50%)')
  } else {
    anchorStyle.bottom = `${renderSpec.bottomMarginPx * scale}px`
  }

  return {
    ...anchorStyle,
    maxWidth: `${renderSpec.maxWidthPx * scale}px`,
    padding: `${renderSpec.boxPaddingPx * scale}px`,
    fontSize: `${renderSpec.fontSizePx * scale}px`,
    lineHeight: `${renderSpec.lineHeightPx * scale}px`,
    fontFamily: renderSpec.previewFontStack || DEFAULT_SUBTITLE_FONT_STACK,
    fontWeight: 600,
    color: renderSpec.fontColor,
    background: renderSpec.backgroundColor,
    textShadow: `${1 * scale}px ${1 * scale}px ${2 * scale}px ${renderSpec.shadowColor}`,
    transform: transformParts.length > 0 ? transformParts.join(' ') : undefined,
  }
}