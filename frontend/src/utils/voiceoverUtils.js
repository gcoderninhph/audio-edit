import { getAuthRequestHeaders, updateStoredAuthCredits } from './authClient'
import { apiFetch } from './runtimeConfig'

function normalizeErrorMessage(message, fallbackMessage) {
  const normalizedMessage = String(message || '').trim()
  return normalizedMessage || fallbackMessage
}

async function readApiErrorMessage(response, fallbackMessage) {
  const responseText = await response.text().catch(() => '')
  if (!responseText) return fallbackMessage
  try {
    const payload = JSON.parse(responseText)
    return normalizeErrorMessage(payload?.detail || payload?.error || payload?.message || payload?.error_message, fallbackMessage)
  } catch {
    return normalizeErrorMessage(responseText, fallbackMessage)
  }
}

export async function fetchVoiceoverClientConfig() {
  const response = await apiFetch('/api/voiceover/config')
  if (!response.ok) throw new Error(await readApiErrorMessage(response, 'Unable to load voiceover config'))
  return response.json()
}

export async function estimateVoiceoverCredits(subtitles, options = {}) {
  const subtitlePayload = normalizeSubtitlePayload(subtitles)
  if (!subtitlePayload.length) {
    throw new Error('No subtitles available to estimate voiceover credits')
  }

  const requestPayload = { subtitles: subtitlePayload }
  if (options.language) {
    requestPayload.language = String(options.language)
  }
  if (options.languageCode) {
    requestPayload.languageCode = String(options.languageCode)
  }
  if (options.voiceCode) {
    requestPayload.voiceCode = String(options.voiceCode)
  }

  const response = await apiFetch('/api/voiceover/estimate', {
    method: 'POST',
    headers: {
      ...getAuthRequestHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestPayload),
    signal: options.signal,
  })

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Unable to estimate voiceover credits'))
  }

  const payload = await response.json()
  return payload.estimate || payload
}

async function fetchVoiceoverStatus(requestId) {
  const statusResponse = await apiFetch(`/api/voiceover/status/${requestId}`, {
    headers: getAuthRequestHeaders(),
  })
  if (statusResponse.status === 404) throw new Error('The voiceover job does not exist')
  if (!statusResponse.ok) throw new Error(await readApiErrorMessage(statusResponse, 'Unable to check voiceover job status'))
  return statusResponse.json()
}

function normalizeSubtitlePayload(subtitles) {
  return subtitles
    .map((subtitle) => ({
      end: Number(subtitle.end || 0),
      start: Number(subtitle.start || 0),
      text: String(subtitle.text || '').trim(),
    }))
    .filter((subtitle) => subtitle.text)
}

function getNarratorBridge() {
  return window.desktopBridge?.narratorCompose || null
}

function normalizeBytes(bytes) {
  if (bytes instanceof Uint8Array) return bytes
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes)
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (Array.isArray(bytes)) return Uint8Array.from(bytes)
  return new Uint8Array()
}

async function readAudioDuration(audioBlob) {
  if (typeof document === 'undefined') return 0
  const previewUrl = URL.createObjectURL(audioBlob)
  try {
    return await new Promise((resolve) => {
      const audioElement = document.createElement('audio')
      audioElement.preload = 'metadata'
      audioElement.onloadedmetadata = () => resolve(audioElement.duration || 0)
      audioElement.onerror = () => resolve(0)
      audioElement.src = previewUrl
    })
  } finally {
    URL.revokeObjectURL(previewUrl)
  }
}

function extractFileName(contentDisposition, fallbackFileName) {
  const fileNameMatch = String(contentDisposition || '').match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i)
  return fileNameMatch ? decodeURIComponent(fileNameMatch[1]).replace(/^"|"$/g, '') : fallbackFileName
}

async function downloadAudioUrl(audioUrl, fallbackFileName, options = {}) {
  const narratorBridge = getNarratorBridge()
  if (narratorBridge?.downloadAudio) {
    const result = await narratorBridge.downloadAudio({
      projectId: options.projectId || '',
      segmentHash: options.segmentHash || '',
      url: audioUrl,
    })
    return {
      bytes: normalizeBytes(result.bytes),
      fileName: result.fileName || fallbackFileName,
      mimeType: result.mimeType || 'application/octet-stream',
    }
  }

  const response = await fetch(audioUrl)
  if (!response.ok) {
    throw new Error(`Unable to download Vbee audio: ${response.status}`)
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    fileName: extractFileName(response.headers.get('Content-Disposition'), fallbackFileName),
    mimeType: response.headers.get('Content-Type') || 'application/octet-stream',
  }
}

function isCompleteStatus(status) {
  return ['complete', 'completed', 'done', 'success', 'succeeded', 'finished'].includes(String(status || '').toLowerCase())
}

function isFailedStatus(status) {
  return ['failed', 'failure', 'error', 'errored', 'cancelled', 'canceled'].includes(String(status || '').toLowerCase())
}

function getCompletedSegments(statusData) {
  const segments = Array.isArray(statusData?.segments) ? statusData.segments : []
  return segments
    .filter((segment) => isCompleteStatus(segment.status) && segment.audioUrl)
    .map((segment, index) => ({
      audioUrl: segment.audioUrl,
      cacheKey: segment.cacheKey || '',
      endMs: Number(segment.endMs || 0),
      fileName: `vbee-segment-${index + 1}.audio`,
      index: Number.isFinite(Number(segment.index)) ? Number(segment.index) : index,
      startMs: Number(segment.startMs || 0),
      text: segment.text || '',
    }))
}

function isMatchingSegment(leftSegment, rightSegment) {
  if ((leftSegment?.cacheKey || '') && (rightSegment?.cacheKey || '')) {
    return leftSegment.cacheKey === rightSegment.cacheKey
  }
  return String(leftSegment?.index ?? '') === String(rightSegment?.index ?? '')
}

function resolveVoiceoverSegmentCount(statusData, completedSegments, downloadedSegments) {
  const candidateCount = Number(statusData?.totalSegments || 0)
  if (Number.isFinite(candidateCount) && candidateCount > 0) {
    return Math.max(1, Math.round(candidateCount))
  }
  return Math.max(1, completedSegments.length, downloadedSegments.size)
}

function buildVoiceoverDownloadPercent(downloadedCount, totalSegments) {
  if (!Number.isFinite(totalSegments) || totalSegments <= 0) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round((Math.max(0, downloadedCount) / totalSegments) * 100)))
}

function reportVoiceoverDownloadProgress(onProgress, phase, downloadedCount, totalSegments) {
  onProgress?.({
    downloadedFiles: downloadedCount,
    percent: buildVoiceoverDownloadPercent(downloadedCount, totalSegments),
    phase: `${phase} (${Math.min(downloadedCount, totalSegments)}/${totalSegments})`,
    totalFiles: totalSegments,
  })
}

async function downloadSegmentWithRetry(requestId, segment, projectId) {
  try {
    return {
      ...segment,
      ...(await downloadAudioUrl(segment.audioUrl, segment.fileName, {
        projectId,
        segmentHash: segment.cacheKey,
      })),
    }
  } catch (error) {
    if (!requestId) {
      throw error
    }
    const refreshedStatus = await fetchVoiceoverStatus(requestId)
    const refreshedSegment = getCompletedSegments(refreshedStatus).find((candidate) => isMatchingSegment(candidate, segment))
    const retrySegment = refreshedSegment?.audioUrl ? refreshedSegment : segment
    if (!retrySegment?.audioUrl) {
      throw error
    }
    return {
      ...retrySegment,
      ...(await downloadAudioUrl(retrySegment.audioUrl, retrySegment.fileName, {
        projectId,
        segmentHash: retrySegment.cacheKey,
      })),
    }
  }
}

async function downloadNewSegments(statusData, requestId, projectId, downloadedSegments, onProgress) {
  const completedSegments = getCompletedSegments(statusData)
  const totalSegments = resolveVoiceoverSegmentCount(statusData, completedSegments, downloadedSegments)
  for (const segment of completedSegments) {
    const segmentKey = String(segment.index)
    const currentDownload = downloadedSegments.get(segmentKey)
    if (currentDownload?.audioUrl === segment.audioUrl) continue
    const downloadResult = await downloadSegmentWithRetry(requestId, segment, projectId)
    downloadedSegments.set(segmentKey, downloadResult)
    reportVoiceoverDownloadProgress(onProgress, 'Downloading completed Vbee audio files...', downloadedSegments.size, totalSegments)
  }
  return { completedSegments, totalSegments }
}

async function composeDownloadedSegments(downloadedSegments, requestId, totalDurationMs, projectId) {
  const sortedSegments = Array.from(downloadedSegments.values()).sort((a, b) => a.index - b.index)
  const narratorBridge = getNarratorBridge()
  if (narratorBridge?.compose) {
    const result = await narratorBridge.compose({ projectId: projectId || '', requestId, segments: sortedSegments, totalDurationMs })
    const bytes = normalizeBytes(result.bytes)
    const audioBlob = new Blob([bytes], { type: result.mimeType || 'audio/wav' })
    return {
      audioBlob,
      duration: Number.isFinite(Number(result.duration)) ? Number(result.duration) : await readAudioDuration(audioBlob),
      fileName: result.fileName || `voiceover-${requestId}.wav`,
      mimeType: result.mimeType || 'audio/wav',
    }
  }
  if (sortedSegments.length === 1) {
    const segment = sortedSegments[0]
    const audioBlob = new Blob([segment.bytes], { type: segment.mimeType || 'audio/mpeg' })
    return {
      audioBlob,
      duration: await readAudioDuration(audioBlob),
      fileName: segment.fileName || `voiceover-${requestId}.mp3`,
      mimeType: segment.mimeType || 'audio/mpeg',
    }
  }
  throw new Error('Native narrator compose is required for multi-segment voiceover output.')
}

async function pollVoiceoverJob(requestId, subtitles, onProgress, options = {}) {
  const downloadedSegments = new Map()
  const totalDurationMs = Math.max(0, ...subtitles.map((subtitle) => Number(subtitle.end || 0) * 1000))

  while (true) {
    await new Promise((resolve) => window.setTimeout(resolve, 500))
    const statusData = await fetchVoiceoverStatus(requestId)
    const { completedSegments, totalSegments } = await downloadNewSegments(statusData, requestId, options.projectId, downloadedSegments, onProgress)
    const downloadedCount = downloadedSegments.size

    if (isFailedStatus(statusData.status)) {
      throw new Error(statusData.errorMessage || statusData.error_message || 'Voiceover generation failed')
    }

    if (isCompleteStatus(statusData.status)) {
      if (downloadedCount < totalSegments) {
        throw new Error('Vbee completed the request without returning every audio URL')
      }
      onProgress?.({ downloadedFiles: downloadedCount, percent: 100, phase: `Composing narration audio... (${downloadedCount}/${totalSegments})`, totalFiles: totalSegments })
      const composedAudio = await composeDownloadedSegments(downloadedSegments, requestId, totalDurationMs, options.projectId)
      return {
        ...composedAudio,
        downloadUrl: (statusData.downloadUrls || [])[0] || '',
        requestId,
      }
    }

    if (String(statusData.status || '').toLowerCase() === 'queued') {
      reportVoiceoverDownloadProgress(onProgress, 'Waiting for completed audio files...', downloadedCount, totalSegments)
    } else if (completedSegments.length > downloadedCount) {
      reportVoiceoverDownloadProgress(onProgress, 'Downloading completed Vbee audio files...', downloadedCount, totalSegments)
    } else {
      reportVoiceoverDownloadProgress(onProgress, 'Vbee is generating audio files...', downloadedCount, totalSegments)
    }
  }
}

export async function createVoiceoverFromSubtitles(subtitles, onProgress, options = {}) {
  const subtitlePayload = normalizeSubtitlePayload(subtitles)
  if (!subtitlePayload.length) {
    throw new Error('No subtitles available to generate voiceover')
  }

  onProgress?.({ phase: 'Preparing subtitle payload...', percent: 0 })
  const requestPayload = { subtitles: subtitlePayload }
  if (options.language) {
    requestPayload.language = String(options.language)
  }
  if (options.languageCode) {
    requestPayload.languageCode = String(options.languageCode)
  }
  if (options.voiceCode) {
    requestPayload.voiceCode = String(options.voiceCode)
  }
  const startResponse = await apiFetch('/api/voiceover/start', {
    method: 'POST',
    headers: {
      ...getAuthRequestHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestPayload),
  })

  if (!startResponse.ok) {
    throw new Error(await readApiErrorMessage(startResponse, 'Unable to start the voiceover job'))
  }

  const startData = await startResponse.json()
  const nextCreditBalance = Number(startData.creditBalance)
  if (Number.isFinite(nextCreditBalance)) {
    updateStoredAuthCredits(nextCreditBalance)
  }
  const requestId = startData.request_id || startData.requestId
  if (!requestId) {
    throw new Error('Vbee did not return a request_id')
  }

  onProgress?.({ phase: startData.status === 'queued' ? 'Waiting for completed audio files...' : 'Vbee accepted the job...', percent: 0 })
  return pollVoiceoverJob(requestId, subtitlePayload, onProgress, options)
}
