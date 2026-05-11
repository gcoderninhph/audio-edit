function getProjectStore() {
  const projectStore = window.desktopBridge?.projectStore
  if (!projectStore) {
    throw new Error('Desktop project storage is only available inside the Electron runtime.')
  }

  return projectStore
}

function buildStoredVideoSource(videoRecord) {
  return {
    kind: 'stored-project-video',
    projectId: videoRecord.projectId,
    name: videoRecord.fileName || videoRecord.storedFileName || 'video.mp4',
    type: videoRecord.mimeType || 'video/mp4',
    size: videoRecord.size || 0,
    url: videoRecord.url,
  }
}

function normalizeBinaryPayload(bytes) {
  if (!bytes) {
    return new Uint8Array()
  }

  if (bytes instanceof Uint8Array) {
    return bytes
  }

  if (bytes instanceof ArrayBuffer) {
    return new Uint8Array(bytes)
  }

  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  if (Array.isArray(bytes)) {
    return Uint8Array.from(bytes)
  }

  throw new Error('Unsupported binary payload received from the Electron project store.')
}

export function saveLocalProject(projectData) {
  return getProjectStore().saveProject(projectData)
}

export async function saveLocalProjectVideo(projectId, file) {
  const payload = {
    projectId,
    originalName: file.name,
    mimeType: file.type || 'video/mp4',
    sourcePath: typeof file.path === 'string' && file.path ? file.path : null,
  }

  if (!payload.sourcePath) {
    payload.bytes = new Uint8Array(await file.arrayBuffer())
  }

  return getProjectStore().saveVideoFile(payload)
}

export async function saveLocalProjectVoiceoverAudio(projectId, payload) {
  const rawBytes = payload?.bytes
  const bytes = typeof Blob !== 'undefined' && rawBytes instanceof Blob
    ? new Uint8Array(await rawBytes.arrayBuffer())
    : normalizeBinaryPayload(rawBytes)

  return getProjectStore().saveVoiceoverFile({
    projectId,
    originalName: payload?.fileName || 'voiceover.mp3',
    mimeType: payload?.mimeType || 'audio/mpeg',
    duration: Number.isFinite(payload?.duration) ? payload.duration : 0,
    bytes,
  })
}

export function listLocalProjects() {
  return getProjectStore().listProjects()
}

export function getLocalProject(projectId) {
  return getProjectStore().getProject(projectId)
}

export async function getLocalProjectVideoReference(projectId) {
  const videoRecord = await getProjectStore().getProjectVideo(projectId)
  if (!videoRecord) {
    return null
  }

  return {
    name: videoRecord.fileName || videoRecord.storedFileName || 'video.mp4',
    storedFileName: videoRecord.storedFileName || '',
    mimeType: videoRecord.mimeType || 'video/mp4',
    url: videoRecord.url,
    source: buildStoredVideoSource(videoRecord),
  }
}

async function materializeLocalProjectVideo(projectId) {
  const videoRecord = await getProjectStore().readProjectVideoBytes(projectId)
  if (!videoRecord) {
    return null
  }

  const bytes = normalizeBinaryPayload(videoRecord.bytes)
  const blob = new Blob([bytes], { type: videoRecord.mimeType || 'video/mp4' })
  const file = new File([blob], videoRecord.fileName || 'video.mp4', {
    type: videoRecord.mimeType || 'video/mp4',
  })

  return {
    file,
    name: file.name,
    storedFileName: videoRecord.storedFileName || '',
    url: URL.createObjectURL(blob),
  }
}

export async function materializeLocalProjectVoiceover(projectId) {
  const voiceoverRecord = await getProjectStore().readProjectVoiceoverBytes(projectId)
  if (!voiceoverRecord) {
    return null
  }

  const bytes = normalizeBinaryPayload(voiceoverRecord.bytes)
  const blob = new Blob([bytes], { type: voiceoverRecord.mimeType || 'audio/mpeg' })

  return {
    duration: Number.isFinite(voiceoverRecord.duration) ? voiceoverRecord.duration : 0,
    fileName: voiceoverRecord.fileName || voiceoverRecord.storedFileName || 'voiceover.mp3',
    mimeType: voiceoverRecord.mimeType || 'audio/mpeg',
    previewUrl: URL.createObjectURL(blob),
    storedFileName: voiceoverRecord.storedFileName || '',
  }
}

export async function materializeVideoFile(videoSource) {
  if (videoSource instanceof File) {
    return videoSource
  }

  if (videoSource instanceof Blob) {
    return new File([videoSource], 'video.mp4', {
      type: videoSource.type || 'video/mp4',
    })
  }

  if (videoSource?.kind === 'stored-project-video') {
    const restoredVideo = await materializeLocalProjectVideo(videoSource.projectId)
    return restoredVideo?.file || null
  }

  throw new Error('Unsupported video source.')
}

export async function buildDesktopExportSourceDescriptor(videoSource) {
  if (!videoSource) {
    throw new Error('Missing video source for desktop export.')
  }

  if (videoSource?.kind === 'stored-project-video') {
    return {
      kind: 'stored-project-video',
      projectId: videoSource.projectId,
      fileName: videoSource.name || 'video.mp4',
      mimeType: videoSource.type || 'video/mp4',
    }
  }

  if (videoSource instanceof File) {
    if (typeof videoSource.path === 'string' && videoSource.path) {
      return {
        kind: 'file-path',
        sourcePath: videoSource.path,
        fileName: videoSource.name || 'video.mp4',
        mimeType: videoSource.type || 'video/mp4',
      }
    }

    return {
      kind: 'file-bytes',
      fileName: videoSource.name || 'video.mp4',
      mimeType: videoSource.type || 'video/mp4',
      bytes: new Uint8Array(await videoSource.arrayBuffer()),
    }
  }

  if (videoSource instanceof Blob) {
    return {
      kind: 'file-bytes',
      fileName: 'video.mp4',
      mimeType: videoSource.type || 'video/mp4',
      bytes: new Uint8Array(await videoSource.arrayBuffer()),
    }
  }

  throw new Error('Unsupported video source for desktop export.')
}

export function getPlayableVideoUrl(videoSource) {
  if (!videoSource) {
    throw new Error('Missing video source.')
  }

  if (typeof videoSource.url === 'string' && videoSource.url) {
    return {
      url: videoSource.url,
      shouldRevoke: false,
    }
  }

  const url = URL.createObjectURL(videoSource)
  return {
    url,
    shouldRevoke: true,
  }
}

export function releaseObjectUrl(objectUrl) {
  if (typeof objectUrl === 'string' && objectUrl.startsWith('blob:')) {
    URL.revokeObjectURL(objectUrl)
  }
}

export function releaseVideoUrl(videoUrl) {
  releaseObjectUrl(videoUrl)
}

export function deleteLocalProject(projectId) {
  return getProjectStore().deleteProject(projectId)
}