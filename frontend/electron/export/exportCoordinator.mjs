import { app } from 'electron'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { appendDebugLog } from '../debugLog.mjs'
import { resolveProjectVideoPath } from '../projectStore.mjs'
import {
  buildFinalMuxArgs,
  getExportTimelineDurationSeconds,
  isAudioMixMuted,
  normalizeExportAudioMix,
} from '../../src/utils/exportAudioMix.js'
import { describeFrameBackground, getFramePresetById, isImageFrameBackground, sanitizeFrameBackground } from '../../src/utils/frameComposer.js'
import { renderNativeExportAudioTrack } from './exportAudioStage.mjs'
import { resolveExportOutputTarget } from './exportOutputIpc.mjs'
import { frameMergedVideo } from './framePipeline.mjs'
import { runNativeFfmpeg } from './nativeFfmpeg.mjs'
import { extractSceneSegments, mergeSceneSegments } from './scenePipeline.mjs'

const detachedRendererJobs = new Set()

function createExportError(message, code = 'NATIVE_EXPORT_FAILED') {
  const error = new Error(message)
  error.code = code
  return error
}

function sanitizeFileName(fileName, fallback = 'input.mp4') {
  return String(fileName || fallback).replace(/[^a-z0-9._-]+/gi, '_') || fallback
}

function toBuffer(bytes) {
  if (!bytes) {
    return Buffer.alloc(0)
  }

  if (Buffer.isBuffer(bytes)) {
    return bytes
  }

  if (bytes instanceof ArrayBuffer) {
    return Buffer.from(bytes)
  }

  if (ArrayBuffer.isView(bytes)) {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  if (Array.isArray(bytes)) {
    return Buffer.from(bytes)
  }

  throw createExportError('Unsupported native export payload received from renderer.', 'NATIVE_EXPORT_INVALID_INPUT')
}

function emitProgress(sender, jobId, update) {
  if (detachedRendererJobs.has(jobId)) {
    return false
  }

  try {
    if (!sender || (typeof sender.isDestroyed === 'function' && sender.isDestroyed())) {
      detachedRendererJobs.add(jobId)
      void appendDebugLog({
        scope: 'native-export',
        message: 'Renderer detached before native export progress could be delivered',
        level: 'warning',
        data: { jobId },
      })
      return false
    }

    sender.send('native-export:progress', { jobId, update })
    return true
  } catch (error) {
    detachedRendererJobs.add(jobId)
    void appendDebugLog({
      scope: 'native-export',
      message: 'Renderer detached during native export progress delivery',
      level: 'warning',
      data: {
        jobId,
        error: error.message,
      },
    })
    return false
  }
}

function emitLog(sender, jobId, phase, message, level = 'info', extra = {}, data = {}) {
  emitProgress(sender, jobId, {
    phase,
    ...extra,
    logEntry: {
      phase,
      level,
      message,
      timestamp: Date.now(),
    },
  })
  void appendDebugLog({
    scope: 'native-export',
    message,
    level,
    data: {
      jobId,
      phase,
      ...data,
    },
  })
}

function buildJobDirectory(jobId) {
  return path.join(app.getPath('userData'), 'native-export', jobId)
}

function formatMegabytes(bytes) {
  return `${(Math.max(0, Number(bytes) || 0) / (1024 * 1024)).toFixed(1)} MB`
}

function normalizeFrameDimension(value) {
  const dimension = Math.round(Number(value) || 0)
  if (dimension < 2 || dimension > 8192) {
    return 0
  }

  return dimension % 2 === 0 ? dimension : dimension - 1
}

function resolveFramePreset(frameSettings = {}) {
  const preset = getFramePresetById(frameSettings?.presetId)
  const requestedWidth = normalizeFrameDimension(frameSettings?.width ?? frameSettings?.size?.width)
  const requestedHeight = normalizeFrameDimension(frameSettings?.height ?? frameSettings?.size?.height)

  if (!requestedWidth || !requestedHeight) {
    return preset
  }

  return {
    ...preset,
    width: requestedWidth,
    height: requestedHeight,
  }
}

async function resolveInputPath(source, jobDirectory) {
  if (source?.kind === 'stored-project-video') {
    const videoPath = await resolveProjectVideoPath(source.projectId)
    if (!videoPath) {
      throw createExportError('Stored project video could not be resolved for native export.', 'NATIVE_EXPORT_INVALID_INPUT')
    }

    return { inputPath: videoPath, transientPaths: [] }
  }

  if (source?.kind === 'file-path' && source.sourcePath) {
    return { inputPath: source.sourcePath, transientPaths: [] }
  }

  if (source?.kind === 'file-bytes') {
    const inputPath = path.join(jobDirectory, sanitizeFileName(source.fileName, 'input.mp4'))
    await writeFile(inputPath, toBuffer(source.bytes))
    return { inputPath, transientPaths: [inputPath] }
  }

  throw createExportError('Unsupported export source for native export.', 'NATIVE_EXPORT_INVALID_INPUT')
}

async function writeOverlayAssets(jobDirectory, subtitleOverlay = {}) {
  const assets = Array.isArray(subtitleOverlay.assets) ? subtitleOverlay.assets : []
  const events = Array.isArray(subtitleOverlay.events) ? subtitleOverlay.events : []
  if (assets.length === 0 || events.length === 0) {
    return []
  }

  const overlayDirectory = path.join(jobDirectory, 'overlays')
  await mkdir(overlayDirectory, { recursive: true })

  const eventMap = new Map()
  for (const event of events) {
    const assetEvents = eventMap.get(event.assetId) || []
    assetEvents.push({
      start: Math.max(0, Number(event.start) || 0),
      end: Math.max(0, Number(event.end) || 0),
    })
    eventMap.set(event.assetId, assetEvents)
  }

  const writtenAssets = []
  for (const asset of assets) {
    const assetEvents = (eventMap.get(asset.id) || []).filter((event) => event.end > event.start)
    if (assetEvents.length === 0) {
      continue
    }

    const assetPath = path.join(overlayDirectory, `${sanitizeFileName(asset.id, 'subtitle')}.png`)
    await writeFile(assetPath, toBuffer(asset.bytes))
    writtenAssets.push({
      path: assetPath,
      x: Math.max(0, Math.round(asset.x || 0)),
      y: Math.max(0, Math.round(asset.y || 0)),
      events: assetEvents,
    })
  }

  return writtenAssets
}

function getImageExtension(mimeType = '') {
  const normalizedMimeType = mimeType.toLowerCase()
  if (normalizedMimeType === 'image/jpeg' || normalizedMimeType === 'image/jpg') {
    return 'jpg'
  }
  if (normalizedMimeType === 'image/png') {
    return 'png'
  }
  if (normalizedMimeType === 'image/webp') {
    return 'webp'
  }

  return 'img'
}

function parseDataUrl(dataUrl = '') {
  const match = String(dataUrl).match(/^data:([^;,]+)?(;base64)?,(.*)$/s)
  if (!match) {
    throw createExportError('Invalid image background payload for native export.', 'NATIVE_EXPORT_INVALID_INPUT')
  }

  const mimeType = match[1] || 'application/octet-stream'
  const isBase64 = Boolean(match[2])
  const body = match[3] || ''
  const bytes = isBase64
    ? Buffer.from(body, 'base64')
    : Buffer.from(decodeURIComponent(body), 'utf8')

  return {
    bytes,
    extension: getImageExtension(mimeType),
    mimeType,
  }
}

async function writeFrameBackgroundAsset(jobDirectory, frameBackground) {
  if (!isImageFrameBackground(frameBackground)) {
    return frameBackground
  }

  const { bytes, extension, mimeType } = parseDataUrl(frameBackground.dataUrl)
  const backgroundPath = path.join(jobDirectory, `frame-background.${extension}`)
  await writeFile(backgroundPath, bytes)

  return {
    ...frameBackground,
    nativeImagePath: backgroundPath,
    nativeMimeType: mimeType,
  }
}

async function runNativeExportJob(sender, payload = {}) {
  const jobId = payload.jobId || `native-export-${Date.now()}`
  const jobDirectory = buildJobDirectory(jobId)
  const framePreset = resolveFramePreset(payload.frameSettings)
  const frameBackground = sanitizeFrameBackground(payload.frameSettings?.backgroundColor)
  const exportQualityProfileId = payload.exportQualityProfileId || null
  const outputTarget = resolveExportOutputTarget(payload.outputTarget, payload.source?.fileName || 'output.mp4')
  const keptScenes = Array.isArray(payload.keptScenes)
    ? payload.keptScenes
      .map((scene) => ({
        ...scene,
        duration: Math.max(0, Number(scene.duration) || (Number(scene.end) || 0) - (Number(scene.start) || 0)),
        start: Math.max(0, Number(scene.start) || 0),
        end: Math.max(0, Number(scene.end) || 0),
      }))
      .filter((scene) => scene.duration > 0)
    : []
  const normalizedAudioMix = normalizeExportAudioMix(payload.audioMix, payload.voiceover)
  const timelineDurationSeconds = getExportTimelineDurationSeconds(keptScenes)

  if (keptScenes.length === 0) {
    throw createExportError('No kept scenes were provided for native export.', 'NATIVE_EXPORT_INVALID_INPUT')
  }

  emitProgress(sender, jobId, {
    phase: 'preparing',
    percent: 0,
    stagePercent: 0,
    detail: 'Khởi tạo native fast export...',
  })

  await mkdir(jobDirectory, { recursive: true })

  try {
    const { inputPath } = await resolveInputPath(payload.source, jobDirectory)
    const { inputPath: voiceoverPath = '' } = payload.voiceover?.source
      ? await resolveInputPath(payload.voiceover.source, jobDirectory)
      : { inputPath: '' }
    const needsAudioRemix = Boolean(voiceoverPath) && !isAudioMixMuted(normalizedAudioMix.voiceoverVolume)
      || isAudioMixMuted(normalizedAudioMix.videoVolume)
      || Math.abs(normalizedAudioMix.videoVolume - 1) > 0.001
    const framedVideoPath = needsAudioRemix ? path.join(jobDirectory, 'framed-output.mp4') : outputTarget.filePath

    await mkdir(outputTarget.directory, { recursive: true })

    const nativeFrameBackground = await writeFrameBackgroundAsset(jobDirectory, frameBackground)
    const overlayAssets = await writeOverlayAssets(jobDirectory, payload.subtitleOverlay)
    emitLog(sender, jobId, 'preparing', 'Resolved native export inputs', 'info', {
      percent: 8,
      stagePercent: 40,
      detail: `Nguồn: ${sanitizeFileName(path.basename(inputPath))} • ${overlayAssets.length} overlay`,
    }, {
      audioMix: normalizedAudioMix,
      frameBackground: describeFrameBackground(frameBackground),
      framePreset: {
        id: framePreset.id,
        label: framePreset.label,
        width: framePreset.width,
        height: framePreset.height,
        requestedPresetId: payload.frameSettings?.presetId || null,
      },
      inputPath,
      overlayCount: overlayAssets.length,
      outputPath: outputTarget.filePath,
      voiceoverPath: voiceoverPath || null,
    })

    const segmentPaths = await extractSceneSegments({
      sender,
      emitLog,
      emitProgress,
      jobId,
      inputPath,
      jobDirectory,
      keptScenes,
    })
    const mergedPath = await mergeSceneSegments({
      sender,
      emitLog,
      emitProgress,
      jobId,
      jobDirectory,
      segmentPaths,
    })
    const { outputPath, encoderPlan } = await frameMergedVideo({
      sender,
      jobId,
      jobDirectory,
      mergedPath,
      outputPath: framedVideoPath,
      exportQualityProfileId,
      keptScenes,
      framePreset,
      frameBackground: nativeFrameBackground,
      overlayAssets,
      emitLog,
      emitProgress,
    })
    let finalOutputPath = outputPath

    if (needsAudioRemix) {
      const mixedAudioPath = await renderNativeExportAudioTrack({
        sender,
        jobId,
        emitLog,
        emitProgress,
        jobDirectory,
        mergedPath,
        voiceoverPath,
        voiceoverTrack: payload.voiceover,
        normalizedAudioMix,
        timelineDurationSeconds,
      })
      const remuxedOutputPath = outputTarget.filePath

      emitLog(sender, jobId, 'audio', 'Remux framed video with configured export audio', 'info', {
        percent: 99,
        stagePercent: 50,
        detail: 'Dang ghep video khung voi audio export',
      }, {
        mixedAudioPath: mixedAudioPath || null,
      })

      await runNativeFfmpeg(buildFinalMuxArgs({
        frameVideoPath: outputPath,
        audioPath: mixedAudioPath || '',
        timelineDurationSeconds,
        outputPath: remuxedOutputPath,
        copyVideo: true,
      }), { cwd: jobDirectory })
      finalOutputPath = remuxedOutputPath
    }

    emitProgress(sender, jobId, {
      phase: 'saving',
      percent: 99,
      stagePercent: 0,
      detail: `Saving export to ${outputTarget.fileName}...`,
    })

    const outputStats = await stat(finalOutputPath)
    emitLog(sender, jobId, 'done', `Native export completed (${formatMegabytes(outputStats.size)})`, 'info', {
      percent: 100,
      stagePercent: 100,
      detail: `Saved native export to ${outputTarget.fileName}`,
    }, {
      encoder: encoderPlan.label,
      outputPath: finalOutputPath,
    })

    return {
      backend: 'native-fast',
      fileName: outputTarget.fileName,
      filePath: finalOutputPath,
      mimeType: 'video/mp4',
      size: outputStats.size,
    }
  } catch (error) {
    emitLog(sender, jobId, 'error', error.message, 'error', {}, {
      code: error.code || 'NATIVE_EXPORT_FAILED',
    })
    throw error
  } finally {
    detachedRendererJobs.delete(jobId)
    await rm(jobDirectory, { force: true, recursive: true })
  }
}

export function registerNativeExportIpc(ipcMain) {
  ipcMain.handle('native-export:run', async (event, payload) => runNativeExportJob(event.sender, payload))
}