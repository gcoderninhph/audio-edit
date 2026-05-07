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

export function getFramePresetById(framePresetId) {
  return FRAME_PRESETS.find((preset) => preset.id === framePresetId) || FRAME_PRESETS[0]
}

export function getFrameBackgroundLabel(frameBackground) {
  return FRAME_BACKGROUND_OPTIONS.find((option) => option.value === frameBackground)?.label || 'Custom'
}

export function getFrameAspectRatio(framePresetId) {
  const framePreset = getFramePresetById(framePresetId)
  return `${framePreset.width} / ${framePreset.height}`
}

export function getFrameSummary(framePresetId) {
  const framePreset = getFramePresetById(framePresetId)
  return `${framePreset.label} • ${framePreset.width}x${framePreset.height}`
}

export function sanitizeFrameBackground(frameBackground) {
  return /^#[0-9a-f]{6}$/i.test(frameBackground || '')
    ? frameBackground
    : DEFAULT_FRAME_BACKGROUND
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