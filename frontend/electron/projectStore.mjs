import { app } from 'electron'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

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
  return {
    id: projectId,
    video_filename: payload.videoFilename ?? existingRecord?.video_filename ?? '',
    video_original_name: payload.videoOriginalName ?? existingRecord?.video_original_name ?? '',
    video_size: payload.videoSize ?? existingRecord?.video_size ?? 0,
    video_mime_type: payload.videoMimeType ?? existingRecord?.video_mime_type ?? '',
    scenes: Array.isArray(payload.scenes) ? payload.scenes : existingRecord?.scenes ?? [],
    deleted_ids: Array.isArray(payload.deletedIds) ? payload.deletedIds : existingRecord?.deleted_ids ?? [],
    subtitles: Array.isArray(payload.subtitles) ? payload.subtitles : existingRecord?.subtitles ?? [],
    sensitivity: payload.sensitivity ?? existingRecord?.sensitivity ?? 2.5,
    transcription_job_id: payload.transcriptionJobId ?? existingRecord?.transcription_job_id ?? null,
    translation_job_id: payload.translationJobId ?? existingRecord?.translation_job_id ?? null,
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
    const leftTime = Date.parse(left.updated_at || 0)
    const rightTime = Date.parse(right.updated_at || 0)
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

async function readProjectVideo(projectId) {
  const projectRecord = await getProject(projectId)
  if (!projectRecord.video_filename) {
    return null
  }

  const videoPath = path.join(getProjectDirectory(projectRecord.id), projectRecord.video_filename)
  const videoBytes = await readFile(videoPath)

  return {
    fileName: projectRecord.video_original_name || projectRecord.video_filename,
    storedFileName: projectRecord.video_filename,
    mimeType: projectRecord.video_mime_type || 'video/mp4',
    bytes: new Uint8Array(videoBytes),
  }
}

async function deleteProject(projectId) {
  const normalizedProjectId = assertProjectId(projectId)
  await rm(getProjectDirectory(normalizedProjectId), { recursive: true, force: true })

  return {
    message: 'Deleted successfully',
  }
}

export function registerProjectStoreIpc(ipcMain) {
  ipcMain.handle('projects:save-video', (_event, payload) => saveVideoFile(payload))
  ipcMain.handle('projects:save-project', (_event, payload) => saveProject(payload))
  ipcMain.handle('projects:list', () => listProjects())
  ipcMain.handle('projects:get', (_event, projectId) => getProject(projectId))
  ipcMain.handle('projects:read-video', (_event, projectId) => readProjectVideo(projectId))
  ipcMain.handle('projects:delete', (_event, projectId) => deleteProject(projectId))
}