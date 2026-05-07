function getProjectStore() {
  const projectStore = window.desktopBridge?.projectStore
  if (!projectStore) {
    throw new Error('Desktop project storage is only available inside the Electron runtime.')
  }

  return projectStore
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

  throw new Error('Unsupported video payload received from the Electron project store.')
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

export function listLocalProjects() {
  return getProjectStore().listProjects()
}

export function getLocalProject(projectId) {
  return getProjectStore().getProject(projectId)
}

export async function readLocalProjectVideo(projectId) {
  const videoRecord = await getProjectStore().readProjectVideo(projectId)
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

export function deleteLocalProject(projectId) {
  return getProjectStore().deleteProject(projectId)
}