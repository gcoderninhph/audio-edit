import { logExportDebug } from './desktopLogger'
import { describeFrameBackground, getFramePresetById, sanitizeFrameBackground } from './frameComposer'
import { buildDesktopExportSourceDescriptor } from './projectStorage'
import { buildSubtitleOverlayAssets } from './subtitleOverlayAssets'

function createExportError(message, code = 'NATIVE_EXPORT_FAILED') {
  const error = new Error(message)
  error.code = code
  return error
}

function getNativeExportBridge() {
  return window.desktopBridge?.nativeExport || null
}

function normalizeBinaryPayload(bytes) {
  if (!bytes) {
    return new Uint8Array()
  }

  if (bytes instanceof Uint8Array) {
    return bytes
  }

  if (bytes instanceof ArrayBuffer) {
    return new Uint8Array(bytes)
  }

  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  if (Array.isArray(bytes)) {
    return Uint8Array.from(bytes)
  }

  throw createExportError('Unsupported native export result payload.', 'NATIVE_EXPORT_INVALID_OUTPUT')
}

function createJobId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `native-export-${Date.now()}-${Math.round(Math.random() * 100000)}`
}

export async function runNativeExport({ inputFile, keptScenes, subtitles, frameSettings }, onProgress = () => {}) {
  const nativeExportBridge = getNativeExportBridge()
  if (!nativeExportBridge) {
    throw createExportError('Native desktop export bridge is unavailable.', 'NATIVE_EXPORT_UNAVAILABLE')
  }

  const framePreset = getFramePresetById(frameSettings?.presetId)
  const frameBackground = sanitizeFrameBackground(frameSettings?.backgroundColor)
  const source = await buildDesktopExportSourceDescriptor(inputFile)
  const subtitleOverlay = await buildSubtitleOverlayAssets(subtitles, framePreset)
  const jobId = createJobId()

  void logExportDebug('Attempt native fast export backend', {
    frameBackground: describeFrameBackground(frameBackground),
    framePresetId: framePreset.id,
    jobId,
    keptSceneCount: keptScenes.length,
    subtitleAssetCount: subtitleOverlay.assets.length,
    subtitleEventCount: subtitleOverlay.events.length,
  })

  const unsubscribe = nativeExportBridge.onProgress((payload) => {
    if (payload?.jobId !== jobId) {
      return
    }

    onProgress(payload.update || {})
  })

  try {
    const result = await nativeExportBridge.run({
      jobId,
      source,
      keptScenes: keptScenes.map((scene) => ({
        id: scene.id,
        start: scene.start,
        end: scene.end,
        duration: scene.duration,
      })),
      frameSettings: {
        presetId: framePreset.id,
        backgroundColor: frameBackground,
      },
      subtitleOverlay,
    })

    const bytes = normalizeBinaryPayload(result?.bytes)
    const blob = new Blob([bytes], { type: result?.mimeType || 'video/mp4' })
    const url = URL.createObjectURL(blob)

    void logExportDebug('Native fast export completed in renderer bridge', {
      backend: result?.backend || 'native-fast',
      size: blob.size,
    })

    return {
      backend: result?.backend || 'native-fast',
      blob,
      url,
      size: blob.size,
    }
  } catch (error) {
    void logExportDebug('Native fast export failed in renderer bridge', {
      code: error?.code || 'NATIVE_EXPORT_FAILED',
      message: error?.message || 'Unknown native export error',
    }, 'warning')
    throw error
  } finally {
    unsubscribe?.()
  }
}