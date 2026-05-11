import { copyFile, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { appendDebugLog } from './debugLog.mjs'
import {
  assertProjectId,
  buildProjectVideoUrl,
  buildStoredVideoName,
  buildStoredVoiceoverName,
  ensureProjectDirectory,
  ensureProjectsRoot,
  ensureProjectVoiceoverDirectory,
  getProjectsRootCandidates,
  getLegacyProjectVoiceoverPath,
  getProjectDirectory,
  getProjectVideoPath,
  getProjectVoiceoverDirectory,
  getProjectVoiceoverPath,
  isRetryableDeleteError,
  readProjectMetadata,
  readProjectMetadataFromRoot,
  toBuffer,
  wait,
  writeProjectMetadata,
} from './projectStoreShared.mjs'
import { readProjectSubtitleTracks, writeProjectSubtitleTracks } from './projectSubtitleStore.mjs'
import { DEFAULT_FRAME_BACKGROUND, DEFAULT_FRAME_PRESET_ID } from '../src/utils/frameComposer.js'
import { DEFAULT_EXPORT_QUALITY_PROFILE_ID, normalizeExportQualityProfileId } from '../src/utils/exportQualityProfile.js'
import { DEFAULT_SUBTITLE_SETTINGS, normalizeSubtitleSettings } from '../src/utils/subtitleRenderModel.js'
import {
  DEFAULT_SUBTITLE_LANGUAGE_KEY,
  getOriginalSubtitles,
  normalizeActiveSubtitleLanguage,
} from '../src/utils/subtitleTracks.js'

function buildProjectRecord(projectId, payload, existingRecord = null) {
  const hasTranscriptionJobId = Object.prototype.hasOwnProperty.call(payload, 'transcriptionJobId')
  const hasTranslationJobId = Object.prototype.hasOwnProperty.call(payload, 'translationJobId')
  const hasVoiceoverFilename = Object.prototype.hasOwnProperty.call(payload, 'voiceoverFilename')
  const hasVoiceoverOriginalName = Object.prototype.hasOwnProperty.call(payload, 'voiceoverOriginalName')
  const hasVoiceoverMimeType = Object.prototype.hasOwnProperty.call(payload, 'voiceoverMimeType')
  const hasVoiceoverSize = Object.prototype.hasOwnProperty.call(payload, 'voiceoverSize')
  const hasVoiceoverDuration = Object.prototype.hasOwnProperty.call(payload, 'voiceoverDuration')
  const createdAt = existingRecord?.created_at || new Date().toISOString()

  return {
    id: projectId,
    video_filename: payload.videoFilename ?? existingRecord?.video_filename ?? '',
    video_original_name: payload.videoOriginalName ?? existingRecord?.video_original_name ?? '',
    video_size: payload.videoSize ?? existingRecord?.video_size ?? 0,
    video_mime_type: payload.videoMimeType ?? existingRecord?.video_mime_type ?? '',
    frame_preset_id: payload.framePresetId ?? existingRecord?.frame_preset_id ?? DEFAULT_FRAME_PRESET_ID,
    frame_background: payload.frameBackground ?? existingRecord?.frame_background ?? DEFAULT_FRAME_BACKGROUND,
    subtitle_settings: normalizeSubtitleSettings(payload.subtitleSettings ?? existingRecord?.subtitle_settings ?? DEFAULT_SUBTITLE_SETTINGS),
    export_quality_profile_id: normalizeExportQualityProfileId(payload.exportQualityProfileId ?? existingRecord?.export_quality_profile_id ?? DEFAULT_EXPORT_QUALITY_PROFILE_ID),
    scenes: Array.isArray(payload.scenes) ? payload.scenes : existingRecord?.scenes ?? [],
    deleted_ids: Array.isArray(payload.deletedIds) ? payload.deletedIds : existingRecord?.deleted_ids ?? [],
    subtitles: Array.isArray(payload.subtitles) ? payload.subtitles : existingRecord?.subtitles ?? [],
    subtitle_tracks: payload.subtitleTrackManifest ?? existingRecord?.subtitle_tracks ?? {},
    active_subtitle_language: normalizeActiveSubtitleLanguage(
      payload.activeSubtitleLanguage ?? existingRecord?.active_subtitle_language ?? DEFAULT_SUBTITLE_LANGUAGE_KEY,
      payload.subtitleTrackManifest ?? existingRecord?.subtitle_tracks ?? null,
    ),
    sensitivity: payload.sensitivity ?? existingRecord?.sensitivity ?? 2.5,
    transcription_job_id: hasTranscriptionJobId ? payload.transcriptionJobId : existingRecord?.transcription_job_id ?? null,
    translation_job_id: hasTranslationJobId ? payload.translationJobId : existingRecord?.translation_job_id ?? null,
    voiceover_filename: hasVoiceoverFilename ? payload.voiceoverFilename : existingRecord?.voiceover_filename ?? null,
    voiceover_original_name: hasVoiceoverOriginalName ? payload.voiceoverOriginalName : existingRecord?.voiceover_original_name ?? null,
    voiceover_mime_type: hasVoiceoverMimeType ? payload.voiceoverMimeType : existingRecord?.voiceover_mime_type ?? null,
    voiceover_size: hasVoiceoverSize ? payload.voiceoverSize : existingRecord?.voiceover_size ?? 0,
    voiceover_duration: hasVoiceoverDuration ? payload.voiceoverDuration : existingRecord?.voiceover_duration ?? 0,
    created_at: createdAt,
    updated_at: new Date().toISOString(),
  }
}

async function saveVideoFile(payload) {
  const projectId = assertProjectId(payload?.projectId)
  const projectDirectory = await ensureProjectDirectory(projectId)
  const existingRecord = await readProjectMetadata(projectId)

  const storedFileName = buildStoredVideoName(payload?.originalName)
  const targetPath = getProjectVideoPath(projectId, storedFileName)
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

async function saveVoiceoverFile(payload) {
  const projectId = assertProjectId(payload?.projectId)
  const voiceoverDirectory = await ensureProjectVoiceoverDirectory(projectId)
  const existingRecord = await readProjectMetadata(projectId)
  const voiceoverBytes = toBuffer(payload?.bytes)

  if (!voiceoverBytes) {
    throw new Error('Missing voiceover audio content for desktop persistence.')
  }

  const storedFileName = buildStoredVoiceoverName(payload?.originalName)
  if (existingRecord?.voiceover_filename && existingRecord.voiceover_filename !== storedFileName) {
    for (const projectsRoot of getProjectsRootCandidates(existingRecord?._storage_root)) {
      await rm(getProjectVoiceoverPath(projectId, existingRecord.voiceover_filename, projectsRoot), { force: true }).catch(() => undefined)
      await rm(getLegacyProjectVoiceoverPath(projectId, existingRecord.voiceover_filename, projectsRoot), { force: true }).catch(() => undefined)
    }
  }

  const targetPath = getProjectVoiceoverPath(projectId, storedFileName)
  await writeFile(targetPath, voiceoverBytes)
  for (const projectsRoot of getProjectsRootCandidates(existingRecord?._storage_root)) {
    await rm(getLegacyProjectVoiceoverPath(projectId, storedFileName, projectsRoot), { force: true }).catch(() => undefined)
  }

  const fileStats = await stat(targetPath)
  const nextRecord = buildProjectRecord(projectId, {
    voiceoverFilename: storedFileName,
    voiceoverOriginalName: payload?.originalName || existingRecord?.voiceover_original_name || storedFileName,
    voiceoverMimeType: payload?.mimeType || existingRecord?.voiceover_mime_type || 'audio/mpeg',
    voiceoverSize: fileStats.size,
    voiceoverDuration: Number.isFinite(payload?.duration) ? payload.duration : existingRecord?.voiceover_duration ?? 0,
  }, existingRecord)

  await writeProjectMetadata(projectId, nextRecord)

  return {
    storedFileName,
    fileName: nextRecord.voiceover_original_name,
    mimeType: nextRecord.voiceover_mime_type || 'audio/mpeg',
    size: nextRecord.voiceover_size || fileStats.size,
    duration: nextRecord.voiceover_duration || 0,
  }
}

async function saveProject(payload) {
  const projectId = assertProjectId(payload?.sessionId)
  const existingRecord = await readProjectMetadata(projectId)
  const subtitleTracks = payload?.subtitleTracks ?? existingRecord?.subtitle_tracks ?? payload?.subtitles ?? []
  const subtitleTrackManifest = await writeProjectSubtitleTracks(projectId, subtitleTracks)
  const nextRecord = buildProjectRecord(projectId, {
    ...payload,
    activeSubtitleLanguage: payload?.activeSubtitleLanguage ?? existingRecord?.active_subtitle_language ?? DEFAULT_SUBTITLE_LANGUAGE_KEY,
    subtitleTrackManifest,
    subtitles: getOriginalSubtitles(subtitleTracks),
  }, existingRecord)

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
  const projectsById = new Map()

  for (const projectsRoot of getProjectsRootCandidates()) {
    await ensureProjectsRoot(projectsRoot)
    const entries = await readdir(projectsRoot, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory() || projectsById.has(entry.name)) {
        continue
      }

      try {
        const projectRecord = await readProjectMetadataFromRoot(entry.name, projectsRoot)
        if (projectRecord) {
          projectsById.set(projectRecord.id, toProjectSummary(projectRecord))
        }
      } catch {
        // Ignore corrupted project entries so a single bad file does not block the dashboard.
      }
    }
  }

  const projects = Array.from(projectsById.values())

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

  const subtitleTracks = await readProjectSubtitleTracks(projectRecord)

  return {
    ...projectRecord,
    active_subtitle_language: normalizeActiveSubtitleLanguage(projectRecord.active_subtitle_language, subtitleTracks),
    subtitle_tracks: subtitleTracks,
    subtitles: getOriginalSubtitles(subtitleTracks),
  }
}

export async function resolveProjectVideoPath(projectId) {
  const projectRecord = await getProject(projectId)
  if (!projectRecord.video_filename) {
    return null
  }

  for (const projectsRoot of getProjectsRootCandidates(projectRecord._storage_root)) {
    const candidatePath = getProjectVideoPath(projectRecord.id, projectRecord.video_filename, projectsRoot)

    try {
      await stat(candidatePath)
      return candidatePath
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error
      }
    }
  }

  return null
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

async function getProjectVoiceover(projectId) {
  const projectRecord = await getProject(projectId)
  if (!projectRecord.voiceover_filename) {
    return null
  }

  return {
    projectId: projectRecord.id,
    fileName: projectRecord.voiceover_original_name || projectRecord.voiceover_filename,
    storedFileName: projectRecord.voiceover_filename,
    mimeType: projectRecord.voiceover_mime_type || 'audio/mpeg',
    size: projectRecord.voiceover_size || 0,
    duration: projectRecord.voiceover_duration || 0,
  }
}

async function readProjectVoiceoverBytes(projectId) {
  const projectRecord = await getProject(projectId)
  if (!projectRecord.voiceover_filename) {
    return null
  }

  for (const projectsRoot of getProjectsRootCandidates(projectRecord._storage_root)) {
    const candidatePaths = [
      getProjectVoiceoverPath(projectRecord.id, projectRecord.voiceover_filename, projectsRoot),
      getLegacyProjectVoiceoverPath(projectRecord.id, projectRecord.voiceover_filename, projectsRoot),
    ]

    for (const candidatePath of candidatePaths) {
      try {
        const voiceoverBytes = await readFile(candidatePath)
        return {
          fileName: projectRecord.voiceover_original_name || projectRecord.voiceover_filename,
          storedFileName: projectRecord.voiceover_filename,
          mimeType: projectRecord.voiceover_mime_type || 'audio/mpeg',
          duration: projectRecord.voiceover_duration || 0,
          bytes: new Uint8Array(voiceoverBytes),
        }

      } catch (error) {
        if (error?.code !== 'ENOENT') {
          throw error
        }
      }
    }
  }

  return null
}

async function deleteProject(projectId) {
  const normalizedProjectId = assertProjectId(projectId)

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      for (const projectsRoot of getProjectsRootCandidates()) {
        await rm(getProjectDirectory(normalizedProjectId, projectsRoot), { recursive: true, force: true })
        await rm(getProjectVoiceoverDirectory(normalizedProjectId, projectsRoot), { recursive: true, force: true })
      }
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
  ipcMain.handle('projects:save-voiceover', (_event, payload) => saveVoiceoverFile(payload))
  ipcMain.handle('projects:save-project', (_event, payload) => saveProject(payload))
  ipcMain.handle('projects:list', () => listProjects())
  ipcMain.handle('projects:get', (_event, projectId) => getProject(projectId))
  ipcMain.handle('projects:get-video', (_event, projectId) => getProjectVideo(projectId))
  ipcMain.handle('projects:read-video-bytes', (_event, projectId) => readProjectVideoBytes(projectId))
  ipcMain.handle('projects:get-voiceover', (_event, projectId) => getProjectVoiceover(projectId))
  ipcMain.handle('projects:read-voiceover-bytes', (_event, projectId) => readProjectVoiceoverBytes(projectId))
  ipcMain.handle('projects:delete', (_event, projectId) => deleteProject(projectId))
}