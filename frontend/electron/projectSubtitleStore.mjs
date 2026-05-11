import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  getProjectDirectory,
  getProjectsRootCandidates,
} from './projectStoreShared.mjs'
import {
  DEFAULT_SUBTITLE_LANGUAGE_KEY,
  normalizeSubtitleTracks,
  serializeSubtitleTracks,
} from '../src/utils/subtitleTracks.js'

const SUBTITLE_TRACKS_DIRECTORY_NAME = 'subtitles'

function getProjectSubtitleTracksDirectory(projectId, projectsRoot) {
  return path.join(getProjectDirectory(projectId, projectsRoot), SUBTITLE_TRACKS_DIRECTORY_NAME)
}

function buildStoredSubtitleTrackFileName(languageKey = DEFAULT_SUBTITLE_LANGUAGE_KEY) {
  return `track-${languageKey}.json`
}

async function cleanupStaleSubtitleTrackFiles(trackDirectory, expectedFileNames) {
  try {
    const existingEntries = await readdir(trackDirectory, { withFileTypes: true })
    for (const entry of existingEntries) {
      if (!entry.isFile() || expectedFileNames.has(entry.name)) {
        continue
      }

      await rm(path.join(trackDirectory, entry.name), { force: true })
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }
}

async function readSubtitleTrackFile(projectId, fileName, preferredRoot) {
  for (const projectsRoot of getProjectsRootCandidates(preferredRoot)) {
    const trackPath = path.join(getProjectSubtitleTracksDirectory(projectId, projectsRoot), fileName)

    try {
      const fileContent = await readFile(trackPath, 'utf8')
      return JSON.parse(fileContent)
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error
      }
    }
  }

  return null
}

export async function writeProjectSubtitleTracks(projectId, subtitleTracks, projectsRoot) {
  const serializedTracks = serializeSubtitleTracks(subtitleTracks)
  const trackDirectory = getProjectSubtitleTracksDirectory(projectId, projectsRoot)
  const trackManifest = {}
  const expectedFileNames = new Set()

  await mkdir(trackDirectory, { recursive: true })

  for (const [languageKey, track] of Object.entries(serializedTracks)) {
    const fileName = buildStoredSubtitleTrackFileName(languageKey)
    expectedFileNames.add(fileName)

    await writeFile(
      path.join(trackDirectory, fileName),
      JSON.stringify(track.subtitles, null, 2),
      'utf8',
    )

    trackManifest[languageKey] = {
      file_name: fileName,
      label: track.label,
      language_key: languageKey,
      line_count: track.subtitles.length,
      source: track.source,
      updated_at: new Date().toISOString(),
    }
  }

  await cleanupStaleSubtitleTrackFiles(trackDirectory, expectedFileNames)
  return trackManifest
}

export async function readProjectSubtitleTracks(projectRecord) {
  if (!projectRecord?.subtitle_tracks || typeof projectRecord.subtitle_tracks !== 'object') {
    return normalizeSubtitleTracks(projectRecord?.subtitles || [])
  }

  const fallbackTracks = normalizeSubtitleTracks(projectRecord.subtitle_tracks, projectRecord.subtitles || [])
  const hydratedTracks = {}

  for (const [fallbackLanguageKey, trackMeta] of Object.entries(projectRecord.subtitle_tracks)) {
    const languageKey = trackMeta?.language_key || fallbackLanguageKey
    const fileName = trackMeta?.file_name || ''
    const fileSubtitles = fileName
      ? await readSubtitleTrackFile(projectRecord.id, fileName, projectRecord._storage_root)
      : null

    hydratedTracks[languageKey] = {
      languageKey,
      label: trackMeta?.label,
      source: trackMeta?.source,
      subtitles: Array.isArray(fileSubtitles)
        ? fileSubtitles
        : fallbackTracks[languageKey]?.subtitles || [],
    }
  }

  return normalizeSubtitleTracks(hydratedTracks, projectRecord.subtitles || [])
}