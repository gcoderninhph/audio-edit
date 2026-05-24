export const DEFAULT_EXPORT_FRAME_RATE = 60

export const EXPORT_FRAME_RATE_OPTIONS = Object.freeze([
  { value: 30, label: '30 fps' },
  { value: 60, label: '60 fps' },
])

export function normalizeExportFrameRate(frameRate) {
  const normalizedFrameRate = Math.round(Number(frameRate) || 0)
  return EXPORT_FRAME_RATE_OPTIONS.some((option) => option.value === normalizedFrameRate)
    ? normalizedFrameRate
    : DEFAULT_EXPORT_FRAME_RATE
}

export function serializeExportFrameRate(frameRate) {
  return String(normalizeExportFrameRate(frameRate))
}

export function getExportFrameRateLabel(frameRate) {
  return `${normalizeExportFrameRate(frameRate)} fps`
}