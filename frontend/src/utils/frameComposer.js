import { mapRealToKeptTime } from './timeMapping.js'

export const FRAME_PRESETS = [
  { id: 'landscape-16-9', label: '16:9', width: 1920, height: 1080 },
  { id: 'portrait-9-16', label: '9:16', width: 1080, height: 1920 },
  { id: 'square-1-1', label: '1:1', width: 1080, height: 1080 },
  { id: 'portrait-4-5', label: '4:5', width: 1080, height: 1350 },
]

export const FRAME_BACKGROUND_OPTIONS = [
  { value: '#050816', label: 'Midnight' },
  { value: '#111827', label: 'Slate' },
  { value: '#f8fafc', label: 'Snow' },
  { value: '#1d4ed8', label: 'Cobalt' },
]

export const DEFAULT_FRAME_PRESET_ID = FRAME_PRESETS[0].id
export const DEFAULT_FRAME_BACKGROUND = FRAME_BACKGROUND_OPTIONS[0].value
const IMAGE_BACKGROUND_KIND = 'image'
const VIDEO_FADE_BACKGROUND_KIND = 'video-fade'

export const VIDEO_FADE_PRESET_OPTIONS = [
  {
    id: 'soft',
    label: 'Soft',
    nativeBlur: '20:2',
    nativeBrightness: -0.04,
    nativeOverlayOpacity: 0.18,
    nativeSaturation: 1.04,
    previewBlurPx: 36,
    previewBrightness: 0.74,
    previewOverlayOpacity: 0.16,
    previewSaturation: 1.04,
    previewTopShadeOpacity: 0.18,
    previewBottomShadeOpacity: 0.28,
    previewVignetteOpacity: 0.24,
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    nativeBlur: '32:4',
    nativeBrightness: -0.08,
    nativeOverlayOpacity: 0.24,
    nativeSaturation: 1.08,
    previewBlurPx: 56,
    previewBrightness: 0.62,
    previewOverlayOpacity: 0.22,
    previewSaturation: 1.08,
    previewTopShadeOpacity: 0.26,
    previewBottomShadeOpacity: 0.42,
    previewVignetteOpacity: 0.34,
  },
  {
    id: 'bold',
    label: 'Bold',
    nativeBlur: '44:5',
    nativeBrightness: -0.12,
    nativeOverlayOpacity: 0.3,
    nativeSaturation: 1.12,
    previewBlurPx: 72,
    previewBrightness: 0.52,
    previewOverlayOpacity: 0.28,
    previewSaturation: 1.12,
    previewTopShadeOpacity: 0.34,
    previewBottomShadeOpacity: 0.52,
    previewVignetteOpacity: 0.44,
  },
]

export const DEFAULT_VIDEO_FADE_PRESET_ID = VIDEO_FADE_PRESET_OPTIONS[1].id
export const VIDEO_FADE_FRAME_BACKGROUND = Object.freeze(createVideoFadeFrameBackground())

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to read the selected background image.'))
    image.src = dataUrl
  })
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Unable to read the selected image file.'))
    reader.readAsDataURL(file)
  })
}

export function getFramePresetById(framePresetId) {
  return FRAME_PRESETS.find((preset) => preset.id === framePresetId) || FRAME_PRESETS[0]
}

export function isImageFrameBackground(frameBackground) {
  return Boolean(
    frameBackground
      && typeof frameBackground === 'object'
      && frameBackground.kind === IMAGE_BACKGROUND_KIND
      && typeof frameBackground.dataUrl === 'string'
      && /^data:image\//i.test(frameBackground.dataUrl),
  )
}

export function isVideoFadeFrameBackground(frameBackground) {
  return Boolean(
    frameBackground
      && typeof frameBackground === 'object'
      && frameBackground.kind === VIDEO_FADE_BACKGROUND_KIND,
  )
}

export function getVideoFadePresetById(presetId) {
  return VIDEO_FADE_PRESET_OPTIONS.find((preset) => preset.id === presetId) || VIDEO_FADE_PRESET_OPTIONS[1]
}

export function createVideoFadeFrameBackground(presetId = DEFAULT_VIDEO_FADE_PRESET_ID) {
  return {
    kind: VIDEO_FADE_BACKGROUND_KIND,
    presetId: getVideoFadePresetById(presetId).id,
  }
}

export async function createImageFrameBackgroundFromFile(file, { maxDimension = 1600 } = {}) {
  if (!(file instanceof Blob)) {
    throw new Error('Invalid image file.')
  }

  const originalDataUrl = await readFileAsDataUrl(file)
  const image = await loadImageFromDataUrl(originalDataUrl)
  const longestEdge = Math.max(image.naturalWidth || 0, image.naturalHeight || 0, 1)
  const scale = Math.min(1, maxDimension / longestEdge)
  let dataUrl = originalDataUrl

  if (scale < 1) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale))
    canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale))
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Unable to optimize the selected background image.')
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const targetType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    dataUrl = canvas.toDataURL(targetType, targetType === 'image/png' ? undefined : 0.88)
  }

  return {
    kind: IMAGE_BACKGROUND_KIND,
    dataUrl,
    name: typeof file.name === 'string' && file.name.trim() ? file.name.trim() : 'Background image',
  }
}

export function getFrameBackgroundLabel(frameBackground) {
  if (isImageFrameBackground(frameBackground)) {
    return 'Background image'
  }

  if (isVideoFadeFrameBackground(frameBackground)) {
    const preset = getVideoFadePresetById(frameBackground.presetId)
    return `Fade video • ${preset.label}`
  }

  return FRAME_BACKGROUND_OPTIONS.find((option) => option.value === frameBackground)?.label || 'Custom'
}

export function getFrameBackgroundFillColor(frameBackground) {
  return /^#[0-9a-f]{6}$/i.test(frameBackground || '')
    ? frameBackground
    : DEFAULT_FRAME_BACKGROUND
}

export function describeFrameBackground(frameBackground) {
  const normalizedBackground = sanitizeFrameBackground(frameBackground)
  if (isImageFrameBackground(normalizedBackground)) {
    return {
      type: IMAGE_BACKGROUND_KIND,
      name: normalizedBackground.name || 'Background image',
    }
  }

  if (isVideoFadeFrameBackground(normalizedBackground)) {
    const preset = getVideoFadePresetById(normalizedBackground.presetId)
    return {
      type: VIDEO_FADE_BACKGROUND_KIND,
      label: getFrameBackgroundLabel(normalizedBackground),
      presetId: preset.id,
      presetLabel: preset.label,
    }
  }

  return {
    type: 'color',
    value: normalizedBackground,
    label: getFrameBackgroundLabel(normalizedBackground),
  }
}

export function serializeFrameBackground(frameBackground) {
  const normalizedBackground = sanitizeFrameBackground(frameBackground)
  if (isImageFrameBackground(normalizedBackground)) {
    return `image:${normalizedBackground.name || 'background'}:${normalizedBackground.dataUrl.length}:${normalizedBackground.dataUrl.slice(0, 64)}`
  }

  if (isVideoFadeFrameBackground(normalizedBackground)) {
    return `${VIDEO_FADE_BACKGROUND_KIND}:${getVideoFadePresetById(normalizedBackground.presetId).id}`
  }

  return normalizedBackground
}

export function sanitizeFrameBackground(frameBackground) {
  if (/^#[0-9a-f]{6}$/i.test(frameBackground || '')) {
    return frameBackground
  }

  if (isVideoFadeFrameBackground(frameBackground)) {
    return createVideoFadeFrameBackground(frameBackground.presetId)
  }

  if (isImageFrameBackground(frameBackground)) {
    return {
      kind: IMAGE_BACKGROUND_KIND,
      dataUrl: frameBackground.dataUrl,
      name: typeof frameBackground.name === 'string' && frameBackground.name.trim()
        ? frameBackground.name.trim()
        : 'Background image',
    }
  }

  return DEFAULT_FRAME_BACKGROUND
}

export function getFrameAspectRatio(framePresetId) {
  const framePreset = getFramePresetById(framePresetId)
  return `${framePreset.width} / ${framePreset.height}`
}

export function getFrameSummary(framePresetId) {
  const framePreset = getFramePresetById(framePresetId)
  return `${framePreset.label} • ${framePreset.width}x${framePreset.height}`
}

export function buildExportSubtitles(subtitles, keptScenes) {
  if (!Array.isArray(subtitles) || subtitles.length === 0 || !Array.isArray(keptScenes) || keptScenes.length === 0) {
    return []
  }

  return subtitles
    .map((subtitle) => {
      const nextStart = mapRealToKeptTime(subtitle.start, keptScenes)
      const nextEnd = mapRealToKeptTime(subtitle.end, keptScenes)
      const duration = nextEnd - nextStart

      return {
        ...subtitle,
        start: nextStart,
        end: nextEnd,
        duration,
      }
    })
    .filter((subtitle) => subtitle.duration > 0.05)
}