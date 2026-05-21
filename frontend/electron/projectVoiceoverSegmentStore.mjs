import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  assertProjectId,
  ensureProjectVoiceoverSegmentDirectory,
  getProjectVoiceoverSegmentPath,
  getProjectsRootCandidates,
  toBuffer,
} from './projectStoreShared.mjs'

const SEGMENT_FILE_EXTENSIONS = new Map([
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.m4a', 'audio/mp4'],
  ['.ogg', 'audio/ogg'],
])

function assertSegmentHash(segmentHash) {
  const safeSegmentHash = String(segmentHash || '').trim()
  if (!safeSegmentHash || !/^[a-z0-9._-]+$/i.test(safeSegmentHash)) {
    throw new Error('Invalid Vbee segment hash.')
  }
  return safeSegmentHash
}

function inferExtension(fileName = '', mimeType = '') {
  const fileExtension = path.extname(String(fileName || '')).toLowerCase()
  if (fileExtension) return fileExtension
  if (/wav/i.test(mimeType)) return '.wav'
  if (/mpeg|mp3/i.test(mimeType)) return '.mp3'
  if (/ogg/i.test(mimeType)) return '.ogg'
  if (/mp4|aac/i.test(mimeType)) return '.m4a'
  return '.wav'
}

function inferMimeType(filePath) {
  return SEGMENT_FILE_EXTENSIONS.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
}

function buildStoredSegmentFileName(segmentHash, fileName = '', mimeType = '') {
  return `${assertSegmentHash(segmentHash)}${inferExtension(fileName, mimeType)}`
}

async function findStoredSegmentEntry(projectId, segmentHash, preferredRoot) {
  const safeProjectId = assertProjectId(projectId)
  const safeSegmentHash = assertSegmentHash(segmentHash)
  for (const projectsRoot of getProjectsRootCandidates(preferredRoot)) {
    const segmentDirectory = path.dirname(getProjectVoiceoverSegmentPath(safeProjectId, `${safeSegmentHash}.wav`, projectsRoot))
    let files = []
    try {
      files = await readdir(segmentDirectory)
    } catch (error) {
      if (error?.code === 'ENOENT') {
        continue
      }
      throw error
    }
    const matchedFile = files.find((fileName) => fileName === safeSegmentHash || fileName.startsWith(`${safeSegmentHash}.`))
    if (matchedFile) {
      return {
        fileName: matchedFile,
        filePath: path.join(segmentDirectory, matchedFile),
      }
    }
  }
  return null
}

export async function loadProjectVoiceoverSegmentFile(projectId, segmentHash, preferredRoot) {
  if (!projectId || !segmentHash) {
    return null
  }
  const matchedEntry = await findStoredSegmentEntry(projectId, segmentHash, preferredRoot)
  if (!matchedEntry) {
    return null
  }
  const bytes = await readFile(matchedEntry.filePath)
  return {
    bytes: new Uint8Array(bytes),
    fileName: matchedEntry.fileName,
    mimeType: inferMimeType(matchedEntry.filePath),
    storedPath: matchedEntry.filePath,
  }
}

export async function saveProjectVoiceoverSegmentFile(projectId, segmentHash, payload = {}, preferredRoot) {
  const safeProjectId = assertProjectId(projectId)
  const safeSegmentHash = assertSegmentHash(segmentHash)
  const fileName = buildStoredSegmentFileName(safeSegmentHash, payload.fileName, payload.mimeType)
  const projectsRoot = getProjectsRootCandidates(preferredRoot)[0]
  await ensureProjectVoiceoverSegmentDirectory(safeProjectId, projectsRoot)
  const filePath = getProjectVoiceoverSegmentPath(safeProjectId, fileName, projectsRoot)
  await writeFile(filePath, toBuffer(payload.bytes) || Buffer.alloc(0))
  return {
    fileName,
    mimeType: payload.mimeType || inferMimeType(filePath),
    storedPath: filePath,
  }
}