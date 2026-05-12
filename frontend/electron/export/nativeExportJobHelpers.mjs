import { app } from 'electron'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { appendDebugLog } from '../debugLog.mjs'
import { resolveProjectVideoPath } from '../projectStore.mjs'
import { isRetryableDeleteError, wait } from '../projectStoreShared.mjs'
import { getFramePresetById, isImageFrameBackground } from '../../src/utils/frameComposer.js'

const detachedRendererJobs = new Set()

export function createExportError(message, code = 'NATIVE_EXPORT_FAILED') {
  const error = new Error(message)
  error.code = code
  return error
}

export function sanitizeFileName(fileName, fallback = 'input.mp4') {
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

export function emitProgress(sender, jobId, update) {
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

export function emitLog(sender, jobId, phase, message, level = 'info', extra = {}, data = {}) {
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

export function buildJobDirectory(jobId) {
  return path.join(app.getPath('userData'), 'native-export', jobId)
}

export function clearDetachedRendererJob(jobId) {
  detachedRendererJobs.delete(jobId)
}

export async function cleanupJobDirectory(jobDirectory, jobId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(jobDirectory, { force: true, recursive: true })
      return
    } catch (error) {
      if (isRetryableDeleteError(error) && attempt < 4) {
        await wait(150 * (attempt + 1))
        continue
      }

      void appendDebugLog({
        scope: 'native-export',
        message: 'Native export temp cleanup skipped because the job directory is locked',
        level: 'warning',
        data: { code: error?.code || 'CLEANUP_FAILED', jobDirectory, jobId },
      })
      return
    }
  }
}

export function formatMegabytes(bytes) {
  return `${(Math.max(0, Number(bytes) || 0) / (1024 * 1024)).toFixed(1)} MB`
}

function normalizeFrameDimension(value) {
  const dimension = Math.round(Number(value) || 0)
  if (dimension < 2 || dimension > 8192) {
    return 0
  }

  return dimension % 2 === 0 ? dimension : dimension - 1
}

export function resolveFramePreset(frameSettings = {}) {
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

export async function resolveInputPath(source, jobDirectory) {
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

export async function writeOverlayAssets(jobDirectory, subtitleOverlay = {}) {
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

export async function writeFrameBackgroundAsset(jobDirectory, frameBackground) {
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