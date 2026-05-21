import { requestJson } from './adminApi'

export async function fetchAdminVbeeTokens() {
  const response = await requestJson('/api/admin/services/vbee/tokens')
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load Vbee tokens.')
  return response.data || {}
}

export async function createAdminVbeeToken(payload) {
  const response = await requestJson('/api/admin/services/vbee/tokens', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to create Vbee token.')
  return response.data || {}
}

export async function updateAdminVbeeToken(tokenId, payload) {
  const response = await requestJson(`/api/admin/services/vbee/tokens/${encodeURIComponent(tokenId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to update Vbee token.')
  return response.data || {}
}

export async function deleteAdminVbeeToken(tokenId) {
  const response = await requestJson(`/api/admin/services/vbee/tokens/${encodeURIComponent(tokenId)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to delete Vbee token.')
  return response.data || {}
}

export async function fetchAdminVbeeRequests({ page = 1, pageSize = 50, status = '' } = {}) {
  const searchParams = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (status) searchParams.set('status', status)
  const response = await requestJson(`/api/admin/services/vbee/requests?${searchParams.toString()}`)
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load Vbee requests.')
  return response.data || {}
}

export async function fetchAdminVbeeRequestDetail(requestId) {
  const response = await requestJson(`/api/admin/services/vbee/requests/${encodeURIComponent(requestId)}`)
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load Vbee request.')
  return response.data || {}
}

export async function fetchAdminVbeeSegments({ page = 1, pageSize = 10, status = '' } = {}) {
  const searchParams = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (status) searchParams.set('status', status)
  const response = await requestJson(`/api/admin/services/vbee/segments?${searchParams.toString()}`)
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load Vbee segments.')
  return response.data || {}
}

export async function clearAdminVbeeSegmentsCache(password) {
  const response = await requestJson('/api/admin/services/vbee/segments/clear-cache', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to clear Vbee segment cache.')
  return response.data || {}
}

export async function fetchAdminVbeeSegmentDetail(segmentHash) {
  const response = await requestJson(`/api/admin/services/vbee/segments/${encodeURIComponent(segmentHash)}`)
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load Vbee segment.')
  return response.data || {}
}

export async function fetchAdminVbeeSegmentAudioUrl(segmentHash) {
  const response = await requestJson(`/api/admin/services/vbee/segments/${encodeURIComponent(segmentHash)}/audio-url`)
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load Vbee segment audio.')
  return response.data || {}
}

export async function fetchAdminVbeeConfig() {
  const response = await requestJson('/api/admin/services/vbee/config')
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load Vbee config.')
  return response.data || {}
}

export async function updateAdminVbeeConfig(payload) {
  const response = await requestJson('/api/admin/services/vbee/config', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to update Vbee config.')
  return response.data || {}
}