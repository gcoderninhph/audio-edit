import { rm, writeFile } from 'node:fs/promises'
import {
  buildStoredVoiceoverName,
  ensureProjectVoiceoverDirectory,
  getProjectVoiceoverPath,
  writeProjectMetadata,
} from './projectStoreShared.mjs'
import { DEFAULT_VOICEOVER_LANGUAGE_KEY, normalizeVoiceoverLanguageKey } from '../src/utils/subtitleTracks.js'

export function normalizeVoiceoverTrackManifest(projectRecord = null) {
  const manifest = projectRecord?.voiceover_tracks && typeof projectRecord.voiceover_tracks === 'object'
    ? { ...projectRecord.voiceover_tracks }
    : {}

  if (projectRecord?.voiceover_filename) {
    manifest[normalizeVoiceoverLanguageKey(projectRecord.voiceover_language_key || DEFAULT_VOICEOVER_LANGUAGE_KEY)] = {
      duration: projectRecord.voiceover_duration || 0,
      file_name: projectRecord.voiceover_filename,
      mime_type: projectRecord.voiceover_mime_type || 'audio/mpeg',
      original_name: projectRecord.voiceover_original_name || projectRecord.voiceover_filename,
      size: projectRecord.voiceover_size || 0,
    }
  }

  return manifest
}

export function getCurrentProjectVoiceoverTrack(projectRecord) {
  const languageKey = normalizeVoiceoverLanguageKey(projectRecord?.voiceover_language_key || DEFAULT_VOICEOVER_LANGUAGE_KEY)
  const track = normalizeVoiceoverTrackManifest(projectRecord)[languageKey]
  return track?.file_name ? { languageKey, track } : null
}

export async function migrateStoredVoiceover(projectRecord, candidatePath, voiceoverBytes, buildProjectRecord) {
  const languageKey = normalizeVoiceoverLanguageKey(projectRecord.voiceover_language_key || DEFAULT_VOICEOVER_LANGUAGE_KEY)
  const storedFileName = buildStoredVoiceoverName(projectRecord.voiceover_original_name || projectRecord.voiceover_filename, languageKey)
  const targetPath = getProjectVoiceoverPath(projectRecord.id, storedFileName, projectRecord._storage_root)
  const nextVoiceoverTracks = {
    ...normalizeVoiceoverTrackManifest(projectRecord),
    [languageKey]: {
      duration: projectRecord.voiceover_duration || 0,
      file_name: storedFileName,
      mime_type: projectRecord.voiceover_mime_type || 'audio/mpeg',
      original_name: projectRecord.voiceover_original_name || storedFileName,
      size: voiceoverBytes.byteLength,
    },
  }

  if (candidatePath !== targetPath || projectRecord.voiceover_filename !== storedFileName || !projectRecord.voiceover_tracks?.[languageKey]) {
    await ensureProjectVoiceoverDirectory(projectRecord.id, projectRecord._storage_root)
    await writeFile(targetPath, voiceoverBytes)
    if (candidatePath !== targetPath) {
      await rm(candidatePath, { force: true }).catch(() => undefined)
    }

    const nextRecord = buildProjectRecord(projectRecord.id, {
      voiceoverFilename: storedFileName,
      voiceoverOriginalName: projectRecord.voiceover_original_name || storedFileName,
      voiceoverMimeType: projectRecord.voiceover_mime_type || 'audio/mpeg',
      voiceoverSize: voiceoverBytes.byteLength,
      voiceoverDuration: projectRecord.voiceover_duration || 0,
      voiceoverLanguageKey: languageKey,
      voiceoverTracks: nextVoiceoverTracks,
    }, projectRecord)
    await writeProjectMetadata(projectRecord.id, nextRecord, projectRecord._storage_root)
    projectRecord = nextRecord
  }

  return {
    fileName: projectRecord.voiceover_original_name || storedFileName,
    languageKey,
    storedFileName,
    mimeType: projectRecord.voiceover_mime_type || 'audio/mpeg',
    duration: projectRecord.voiceover_duration || 0,
    bytes: new Uint8Array(voiceoverBytes),
  }
}