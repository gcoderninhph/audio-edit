import { requestJson } from './adminApi'

export async function fetchAdminWhisperRequests({ page = 1, pageSize = 20, status = '' } = {}) {
  const searchParams = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (status) searchParams.set('status', status)
  const response = await requestJson(`/api/admin/services/whisper/requests?${searchParams.toString()}`)
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load Whisper requests.')
  return response.data || {}
}

export async function fetchAdminWhisperConfig() {
  const response = await requestJson('/api/admin/services/whisper/config')
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load Whisper config.')
  return response.data || {}
}

export async function fetchAdminWhisperNodes() {
  const response = await requestJson('/api/admin/services/whisper/nodes')
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load Whisper nodes.')
  return response.data || {}
}

export async function createAdminWhisperNode(payload) {
  const response = await requestJson('/api/admin/services/whisper/nodes', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to create Whisper node.')
  return response.data || {}
}

export async function updateAdminWhisperNode(nodeId, payload) {
  const response = await requestJson(`/api/admin/services/whisper/nodes/${nodeId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to update Whisper node.')
  return response.data || {}
}

export async function deleteAdminWhisperNode(nodeId) {
  const response = await requestJson(`/api/admin/services/whisper/nodes/${nodeId}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to delete Whisper node.')
  return response.data || {}
}

export async function updateAdminWhisperConfig(payload) {
  const response = await requestJson('/api/admin/services/whisper/config', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to update Whisper config.')
  return response.data || {}
}
