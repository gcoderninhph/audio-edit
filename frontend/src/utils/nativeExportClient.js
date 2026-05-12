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

function getFileNameFromPath(filePath = '') {
  return String(filePath || '').split(/[\\/]/).pop() || 'output.mp4'
}

export async function runNativeExport({ inputFile, keptScenes, subtitles, frameSettings, subtitleSettings, exportQualityProfileId, outputTarget, voiceoverFile, voiceoverTrack, audioMix }, onProgress = () => {}) {
  const nativeExportBridge = getNativeExportBridge()
  if (!nativeExportBridge) {
    throw createExportError('Native desktop export bridge is unavailable.', 'NATIVE_EXPORT_UNAVAILABLE')
  }

  const framePreset = getFramePresetById(frameSettings?.presetId)
  const frameBackground = sanitizeFrameBackground(frameSettings?.backgroundColor)
  const source = await buildDesktopExportSourceDescriptor(inputFile)
  const subtitleOverlay = await buildSubtitleOverlayAssets(subtitles, framePreset, undefined, subtitleSettings)
  const jobId = createJobId()

  const voiceover = voiceoverFile
    ? {
      source: await buildDesktopExportSourceDescriptor(voiceoverFile),
      fileName: voiceoverTrack?.fileName || voiceoverFile.name || 'voiceover.mp3',
      mimeType: voiceoverTrack?.mimeType || voiceoverFile.type || 'audio/mpeg',
      startTime: Number(voiceoverTrack?.startTime) || 0,
    }
    : null

  void logExportDebug('Attempt native fast export backend', {
    audioMix: audioMix || null,
    exportQualityProfileId: exportQualityProfileId || null,
    outputTarget: outputTarget || null,
    frameBackground: describeFrameBackground(frameBackground),
    framePresetId: framePreset.id,
    framePresetSize: { width: framePreset.width, height: framePreset.height },
    hasVoiceoverTrack: Boolean(voiceover),
    jobId,
    keptSceneCount: keptScenes.length,
    subtitleAssetCount: subtitleOverlay.assets.length,
    subtitleEventCount: subtitleOverlay.events.length,
    subtitleSettings: subtitleSettings || null,
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
        motion: scene.motion || null,
      })),
      frameSettings: {
        presetId: framePreset.id,
        width: framePreset.width,
        height: framePreset.height,
        backgroundColor: frameBackground,
      },
      exportQualityProfileId: exportQualityProfileId || null,
      outputTarget: outputTarget || null,
      audioMix: audioMix || null,
      subtitleOverlay,
      voiceover,
    })

    if (result?.filePath) {
      void logExportDebug('Native fast export completed directly to local file', {
        backend: result?.backend || 'native-fast',
        filePath: result.filePath,
        size: result.size || 0,
      })

      return {
        backend: result?.backend || 'native-fast',
        savedFileName: result.fileName || getFileNameFromPath(result.filePath),
        savedFilePath: result.filePath,
        size: result.size || 0,
      }
    }

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