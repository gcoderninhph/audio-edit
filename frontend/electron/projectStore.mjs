import { app } from 'electron'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { appendDebugLog } from './debugLog.mjs'
import { DEFAULT_FRAME_BACKGROUND, DEFAULT_FRAME_PRESET_ID } from '../src/utils/frameComposer.js'

const PROJECTS_DIR_NAME = 'projects'
const PROJECT_METADATA_FILE = 'project.json'

function getProjectsRoot() {
  return path.join(app.getPath('userData'), PROJECTS_DIR_NAME)
}

function getProjectDirectory(projectId) {
  return path.join(getProjectsRoot(), projectId)
}

function getProjectMetadataPath(projectId) {
  return path.join(getProjectDirectory(projectId), PROJECT_METADATA_FILE)
}

function buildProjectVideoUrl(projectId) {
  return `project-media://project/${encodeURIComponent(projectId)}`
}

function assertProjectId(projectId) {
  if (!projectId || !/^[a-z0-9._-]+$/i.test(projectId)) {
    throw new Error('Invalid project id.')
  }

  return projectId
}

function buildStoredVideoName(originalName = '') {
  const extension = path.extname(originalName) || '.mp4'
  return `video${extension.toLowerCase()}`
}

function toBuffer(bytes) {
  if (!bytes) {
    return null
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

  throw new Error('Unsupported video payload received by the desktop project store.')
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function isRetryableDeleteError(error) {
  return error?.code === 'EBUSY' || error?.code === 'EPERM'
}

async function ensureProjectDirectory(projectId) {
  const projectDirectory = getProjectDirectory(projectId)
  await mkdir(projectDirectory, { recursive: true })
  return projectDirectory
}

async function readProjectMetadata(projectId) {
  try {
    const metadataContent = await readFile(getProjectMetadataPath(projectId), 'utf8')
    return JSON.parse(metadataContent)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

async function writeProjectMetadata(projectId, projectData) {
  await ensureProjectDirectory(projectId)
  await writeFile(
    getProjectMetadataPath(projectId),
    JSON.stringify(projectData, null, 2),
    'utf8',
  )
}

function buildProjectRecord(projectId, payload, existingRecord = null) {
  const hasTranscriptionJobId = Object.prototype.hasOwnProperty.call(payload, 'transcriptionJobId')
  const hasTranslationJobId = Object.prototype.hasOwnProperty.call(payload, 'translationJobId')
  const createdAt = existingRecord?.created_at || new Date().toISOString()

  return {
    id: projectId,
    video_filename: payload.videoFilename ?? existingRecord?.video_filename ?? '',
    video_original_name: payload.videoOriginalName ?? existingRecord?.video_original_name ?? '',
    video_size: payload.videoSize ?? existingRecord?.video_size ?? 0,
    video_mime_type: payload.videoMimeType ?? existingRecord?.video_mime_type ?? '',
    frame_preset_id: payload.framePresetId ?? existingRecord?.frame_preset_id ?? DEFAULT_FRAME_PRESET_ID,
    frame_background: payload.frameBackground ?? existingRecord?.frame_background ?? DEFAULT_FRAME_BACKGROUND,
    scenes: Array.isArray(payload.scenes) ? payload.scenes : existingRecord?.scenes ?? [],
    deleted_ids: Array.isArray(payload.deletedIds) ? payload.deletedIds : existingRecord?.deleted_ids ?? [],
    subtitles: Array.isArray(payload.subtitles) ? payload.subtitles : existingRecord?.subtitles ?? [],
    sensitivity: payload.sensitivity ?? existingRecord?.sensitivity ?? 2.5,
    transcription_job_id: hasTranscriptionJobId ? payload.transcriptionJobId : existingRecord?.transcription_job_id ?? null,
    translation_job_id: hasTranslationJobId ? payload.translationJobId : existingRecord?.translation_job_id ?? null,
    created_at: createdAt,
    updated_at: new Date().toISOString(),
  }
}

async function saveVideoFile(payload) {
  const projectId = assertProjectId(payload?.projectId)
  const projectDirectory = await ensureProjectDirectory(projectId)
  const existingRecord = await readProjectMetadata(projectId)

  const storedFileName = buildStoredVideoName(payload?.originalName)
  const targetPath = path.join(projectDirectory, storedFileName)
  if (payload?.sourcePath) {
    await copyFile(payload.sourcePath, targetPath)
  } else {
    const bytes = toBuffer(payload?.bytes)
    if (!bytes) {
      throw new Error('Missing video file content for desktop persistence.')
    }

    await writeFile(targetPath, bytes)
  }

  const fileStats = await stat(targetPath)
  const nextRecord = buildProjectRecord(projectId, {
    videoFilename: storedFileName,
    videoOriginalName: payload?.originalName || existingRecord?.video_original_name || storedFileName,
    videoSize: fileStats.size,
    videoMimeType: payload?.mimeType || existingRecord?.video_mime_type || 'video/mp4',
  }, existingRecord)

  await writeProjectMetadata(projectId, nextRecord)

  return {
    filename: storedFileName,
    originalName: nextRecord.video_original_name,
    size: fileStats.size,
  }
}

async function saveProject(payload) {
  const projectId = assertProjectId(payload?.sessionId)
  const existingRecord = await readProjectMetadata(projectId)
  const nextRecord = buildProjectRecord(projectId, payload, existingRecord)

  await writeProjectMetadata(projectId, nextRecord)

  return {
    sessionId: projectId,
    message: 'Saved',
  }
}

function toProjectSummary(projectRecord) {
  return {
    id: projectRecord.id,
    created_at: projectRecord.created_at || projectRecord.updated_at,
    preview_url: projectRecord.video_filename ? buildProjectVideoUrl(projectRecord.id) : '',
    video_original_name: projectRecord.video_original_name,
    sensitivity: projectRecord.sensitivity,
    updated_at: projectRecord.updated_at,
  }
}

async function listProjects() {
  await mkdir(getProjectsRoot(), { recursive: true })

  const entries = await readdir(getProjectsRoot(), { withFileTypes: true })
  const projects = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    try {
      const projectRecord = await readProjectMetadata(entry.name)
      if (projectRecord) {
        projects.push(toProjectSummary(projectRecord))
      }
    } catch {
      // Ignore corrupted project entries so a single bad file does not block the dashboard.
    }
  }

  return projects.sort((left, right) => {
    const leftTime = Date.parse(left.created_at || left.updated_at || 0)
    const rightTime = Date.parse(right.created_at || right.updated_at || 0)
    return rightTime - leftTime
  })
}

async function getProject(projectId) {
  const normalizedProjectId = assertProjectId(projectId)
  const projectRecord = await readProjectMetadata(normalizedProjectId)

  if (!projectRecord) {
    throw new Error('Project not found.')
  }

  return projectRecord
}

export async function resolveProjectVideoPath(projectId) {
  const projectRecord = await getProject(projectId)
  if (!projectRecord.video_filename) {
    return null
  }

  return path.join(getProjectDirectory(projectRecord.id), projectRecord.video_filename)
}

async function getProjectVideo(projectId) {
  const projectRecord = await getProject(projectId)
  if (!projectRecord.video_filename) {
    return null
  }

  return {
    projectId: projectRecord.id,
    fileName: projectRecord.video_original_name || projectRecord.video_filename,
    storedFileName: projectRecord.video_filename,
    mimeType: projectRecord.video_mime_type || 'video/mp4',
    size: projectRecord.video_size || 0,
    url: buildProjectVideoUrl(projectRecord.id),
  }
}

async function readProjectVideoBytes(projectId) {
  const projectRecord = await getProject(projectId)
  const videoPath = await resolveProjectVideoPath(projectId)
  if (!videoPath) {
    await appendDebugLog({
      scope: 'project-store',
      message: 'Project video bytes requested but no video path was found',
      data: { projectId: projectRecord.id },
      level: 'warning',
    })
    return null
  }

  await appendDebugLog({
    scope: 'project-store',
    message: 'Start reading stored project video bytes',
    data: {
      expectedBytes: projectRecord.video_size || 0,
      projectId: projectRecord.id,
      videoPath,
    },
  })

  try {
    const videoBytes = await readFile(videoPath)

    await appendDebugLog({
      scope: 'project-store',
      message: 'Finished reading stored project video bytes',
      data: {
        actualBytes: videoBytes.byteLength,
        projectId: projectRecord.id,
      },
    })

    return {
      fileName: projectRecord.video_original_name || projectRecord.video_filename,
      storedFileName: projectRecord.video_filename,
      mimeType: projectRecord.video_mime_type || 'video/mp4',
      bytes: new Uint8Array(videoBytes),
    }
  } catch (error) {
    await appendDebugLog({
      scope: 'project-store',
      message: 'Failed reading stored project video bytes',
      data: {
        projectId: projectRecord.id,
        videoPath,
        error,
      },
      level: 'error',
    })
    throw error
  }
}

async function deleteProject(projectId) {
  const normalizedProjectId = assertProjectId(projectId)
  const projectDirectory = getProjectDirectory(normalizedProjectId)

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(projectDirectory, { recursive: true, force: true })
      break
    } catch (error) {
      if (!isRetryableDeleteError(error) || attempt === 4) {
        throw error
      }

      await wait(120 * (attempt + 1))
    }
  }

  return {
    message: 'Deleted successfully',
  }
}

export function registerProjectStoreIpc(ipcMain) {
  ipcMain.handle('projects:save-video', (_event, payload) => saveVideoFile(payload))
  ipcMain.handle('projects:save-project', (_event, payload) => saveProject(payload))
  ipcMain.handle('projects:list', () => listProjects())
  ipcMain.handle('projects:get', (_event, projectId) => getProject(projectId))
  ipcMain.handle('projects:get-video', (_event, projectId) => getProjectVideo(projectId))
  ipcMain.handle('projects:read-video-bytes', (_event, projectId) => readProjectVideoBytes(projectId))
  ipcMain.handle('projects:delete', (_event, projectId) => deleteProject(projectId))
}