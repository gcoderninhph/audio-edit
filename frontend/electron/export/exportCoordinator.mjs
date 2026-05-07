import { app } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { appendDebugLog } from '../debugLog.mjs'
import { resolveProjectVideoPath } from '../projectStore.mjs'
import { getFramePresetById, sanitizeFrameBackground } from '../../src/utils/frameComposer.js'
import { frameMergedVideo } from './framePipeline.mjs'
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

async function runNativeExportJob(sender, payload = {}) {
  const jobId = payload.jobId || `native-export-${Date.now()}`
  const jobDirectory = buildJobDirectory(jobId)
  const framePreset = getFramePresetById(payload.frameSettings?.presetId)
  const frameBackground = sanitizeFrameBackground(payload.frameSettings?.backgroundColor)
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
    const overlayAssets = await writeOverlayAssets(jobDirectory, payload.subtitleOverlay)
    emitLog(sender, jobId, 'preparing', 'Resolved native export inputs', 'info', {
      percent: 8,
      stagePercent: 40,
      detail: `Nguồn: ${sanitizeFileName(path.basename(inputPath))} • ${overlayAssets.length} overlay`,
    }, {
      inputPath,
      overlayCount: overlayAssets.length,
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
      keptScenes,
      framePreset,
      frameBackground,
      overlayAssets,
      emitLog,
      emitProgress,
    })

    emitProgress(sender, jobId, {
      phase: 'reading',
      percent: 99,
      stagePercent: 0,
      detail: 'Đang đọc file export native...',
    })

    const outputBytes = await readFile(outputPath)
    emitLog(sender, jobId, 'done', `Native export completed (${formatMegabytes(outputBytes.byteLength)})`, 'info', {
      percent: 100,
      stagePercent: 100,
      detail: 'Hoàn thành native fast export',
    }, {
      encoder: encoderPlan.label,
      outputPath,
    })

    return {
      backend: 'native-fast',
      bytes: outputBytes,
      mimeType: 'video/mp4',
      size: outputBytes.byteLength,
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