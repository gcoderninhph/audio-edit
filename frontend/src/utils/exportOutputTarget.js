function getExportOutputBridge() {
  return window.desktopBridge?.exportOutput || null
}

export function buildDefaultExportFileName(sourceName = 'video.mp4') {
  const normalizedSourceName = String(sourceName || 'video.mp4').replace(/\.[^.]+$/, '').trim()
  return `${normalizedSourceName || 'output'}_edited`
}

export function getExportFileNameLabel(fileName = 'output') {
  const normalizedFileName = String(fileName || '').trim()
  return normalizedFileName.toLowerCase().endsWith('.mp4') ? normalizedFileName : `${normalizedFileName || 'output'}.mp4`
}

export function getExportDirectoryLabel(directory = '') {
  const normalizedDirectory = String(directory || '').trim()
  if (!normalizedDirectory) {
    return 'Downloads'
  }

  return normalizedDirectory
}

export async function getDefaultExportDirectory() {
  return getExportOutputBridge()?.getDefaultDirectory?.() || ''
}

export async function chooseExportOutputDirectory() {
  return getExportOutputBridge()?.chooseDirectory?.() || null
}

export async function saveExportBytesToFile(payload) {
  const bridge = getExportOutputBridge()
  if (!bridge?.saveBytes) {
    throw new Error('Desktop export file output is unavailable in this runtime.')
  }

  return bridge.saveBytes(payload)
}

export async function revealExportFile(filePath) {
  return getExportOutputBridge()?.revealFile?.(filePath) || false
}