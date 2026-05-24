import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PROJECTS_DIR_NAME = 'projects'
const PROJECT_METADATA_FILE = 'project.json'
const PROJECT_SUBTITLES_DIR_NAME = 'subtitles'
const PROJECT_VOICEOVER_SEGMENTS_DIR_NAME = 'voiceover-segments'
const PROJECT_VOICEOVERS_DIR_NAME = 'voiceovers'
const PROJECT_SCENE_GRID_FILE_NAME = 'scene-grid.png'

function getWorkspaceProjectsRoot() {
  return path.resolve(app.getAppPath(), '..', PROJECTS_DIR_NAME)
}

function getPackagedExecutableProjectsRoot() {
  return path.join(path.dirname(app.getPath('exe')), PROJECTS_DIR_NAME)
}

function normalizeRoot(rootPath) {
  return path.resolve(rootPath)
}

export function getProjectsRoot() {
  const configuredRoot = process.env.VIDEOFORGE_PROJECTS_ROOT || process.env.ELECTRON_PROJECTS_ROOT
  if (configuredRoot) {
    return normalizeRoot(configuredRoot)
  }

  if (!app.isPackaged) {
    return getWorkspaceProjectsRoot()
  }

  return getPackagedExecutableProjectsRoot()
}

export function getProjectsRootCandidates(preferredRoot = getProjectsRoot()) {
  const candidateRoots = []

  for (const candidateRoot of [preferredRoot]) {
    const normalizedRoot = normalizeRoot(candidateRoot)
    if (!candidateRoots.includes(normalizedRoot)) {
      candidateRoots.push(normalizedRoot)
    }
  }

  return candidateRoots
}

export async function ensureProjectsRoot(projectsRoot = getProjectsRoot()) {
  await mkdir(projectsRoot, { recursive: true })
  return projectsRoot
}

export function getProjectDirectory(projectId, projectsRoot = getProjectsRoot()) {
  return path.join(projectsRoot, projectId)
}

export function getProjectVoiceoverDirectory(projectId, projectsRoot = getProjectsRoot()) {
  return path.join(getProjectDirectory(projectId, projectsRoot), PROJECT_VOICEOVERS_DIR_NAME)
}

export function getProjectSubtitlesDirectory(projectId, projectsRoot = getProjectsRoot()) {
  return path.join(getProjectDirectory(projectId, projectsRoot), PROJECT_SUBTITLES_DIR_NAME)
}

export function getProjectVoiceoverSegmentDirectory(projectId, projectsRoot = getProjectsRoot()) {
  return path.join(getProjectSubtitlesDirectory(projectId, projectsRoot), PROJECT_VOICEOVER_SEGMENTS_DIR_NAME)
}

export function getLegacySiblingProjectVoiceoverDirectory(projectId, projectsRoot = getProjectsRoot()) {
  return path.join(projectsRoot, `${projectId}-voiceover`)
}

export function getProjectMetadataPath(projectId, projectsRoot = getProjectsRoot()) {
  return path.join(getProjectDirectory(projectId, projectsRoot), PROJECT_METADATA_FILE)
}

export function getProjectVideoPath(projectId, fileName, projectsRoot = getProjectsRoot()) {
  return path.join(getProjectDirectory(projectId, projectsRoot), fileName)
}

export function getProjectSceneGridPath(projectId, projectsRoot = getProjectsRoot()) {
  return path.join(getProjectDirectory(projectId, projectsRoot), PROJECT_SCENE_GRID_FILE_NAME)
}

export function getProjectVoiceoverPath(projectId, fileName, projectsRoot = getProjectsRoot()) {
  return path.join(getProjectVoiceoverDirectory(projectId, projectsRoot), fileName)
}

export function getProjectVoiceoverSegmentPath(projectId, fileName, projectsRoot = getProjectsRoot()) {
  return path.join(getProjectVoiceoverSegmentDirectory(projectId, projectsRoot), fileName)
}

export function getLegacySiblingProjectVoiceoverPath(projectId, fileName, projectsRoot = getProjectsRoot()) {
  return path.join(getLegacySiblingProjectVoiceoverDirectory(projectId, projectsRoot), fileName)
}

export function getLegacyProjectVoiceoverPath(projectId, fileName, projectsRoot = getProjectsRoot()) {
  return path.join(getProjectDirectory(projectId, projectsRoot), fileName)
}

export function buildProjectVideoUrl(projectId) {
  return `desktop://app/project-media/${encodeURIComponent(projectId)}`
}

export function buildProjectSceneGridUrl(projectId) {
  return `desktop://app/project-media/${encodeURIComponent(projectId)}/${PROJECT_SCENE_GRID_FILE_NAME}`
}

export function assertProjectId(projectId) {
  if (!projectId || !/^[a-z0-9._-]+$/i.test(projectId)) {
    throw new Error('Invalid project id.')
  }

  return projectId
}

export function buildStoredVideoName(originalName = '') {
  const extension = path.extname(originalName) || '.mp4'
  return `video${extension.toLowerCase()}`
}

export function buildStoredVoiceoverName(originalName = '') {
  const extension = path.extname(originalName) || '.mp3'
  const languageKey = String(arguments[1] || 'default').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-') || 'default'
  return `voiceover-${languageKey}${extension.toLowerCase()}`
}

export function toBuffer(bytes) {
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

  throw new Error('Unsupported binary payload received by the desktop project store.')
}

export function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export function isRetryableDeleteError(error) {
  return error?.code === 'EBUSY' || error?.code === 'EPERM'
}

export async function ensureProjectDirectory(projectId, projectsRoot = getProjectsRoot()) {
  const projectDirectory = getProjectDirectory(projectId, projectsRoot)
  await mkdir(projectDirectory, { recursive: true })
  return projectDirectory
}

export async function ensureProjectVoiceoverDirectory(projectId, projectsRoot = getProjectsRoot()) {
  const voiceoverDirectory = getProjectVoiceoverDirectory(projectId, projectsRoot)
  await mkdir(voiceoverDirectory, { recursive: true })
  return voiceoverDirectory
}

export async function ensureProjectVoiceoverSegmentDirectory(projectId, projectsRoot = getProjectsRoot()) {
  const segmentDirectory = getProjectVoiceoverSegmentDirectory(projectId, projectsRoot)
  await mkdir(segmentDirectory, { recursive: true })
  return segmentDirectory
}

export async function readProjectMetadataFromRoot(projectId, projectsRoot) {
  try {
    const metadataContent = await readFile(getProjectMetadataPath(projectId, projectsRoot), 'utf8')
    return {
      ...JSON.parse(metadataContent),
      _storage_root: normalizeRoot(projectsRoot),
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

export async function readProjectMetadata(projectId, preferredRoot = getProjectsRoot()) {
  for (const projectsRoot of getProjectsRootCandidates(preferredRoot)) {
    const projectMetadata = await readProjectMetadataFromRoot(projectId, projectsRoot)
    if (projectMetadata) {
      return projectMetadata
    }
  }

  return null
}

export async function writeProjectMetadata(projectId, projectData, projectsRoot = getProjectsRoot()) {
  await ensureProjectDirectory(projectId, projectsRoot)
  await writeFile(
    getProjectMetadataPath(projectId, projectsRoot),
    JSON.stringify(projectData, null, 2),
    'utf8',
  )
}