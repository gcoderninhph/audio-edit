import { requestJson } from './adminApi'

export async function fetchAdminOpenAiTokens() {
  const response = await requestJson('/api/admin/services/openai/tokens')
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load OpenAI tokens.')
  return response.data || {}
}

export async function createAdminOpenAiToken(payload) {
  const response = await requestJson('/api/admin/services/openai/tokens', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to create OpenAI token.')
  return response.data || {}
}

export async function updateAdminOpenAiToken(tokenId, payload) {
  const response = await requestJson(`/api/admin/services/openai/tokens/${encodeURIComponent(tokenId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to update OpenAI token.')
  return response.data || {}
}

export async function deleteAdminOpenAiToken(tokenId) {
  const response = await requestJson(`/api/admin/services/openai/tokens/${encodeURIComponent(tokenId)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to delete OpenAI token.')
  return response.data || {}
}

export async function fetchAdminOpenAiRequests({ page = 1, pageSize = 20, status = '' } = {}) {
  const searchParams = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (status) searchParams.set('status', status)
  const response = await requestJson(`/api/admin/services/openai/requests?${searchParams.toString()}`)
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load OpenAI requests.')
  return response.data || {}
}

export async function fetchAdminOpenAiRequestDetail(requestId) {
  const response = await requestJson(`/api/admin/services/openai/requests/${encodeURIComponent(requestId)}`)
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load OpenAI request.')
  return response.data || {}
}

export async function fetchAdminOpenAiConfig() {
  const response = await requestJson('/api/admin/services/openai/config')
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load OpenAI config.')
  return response.data || {}
}

export async function updateAdminOpenAiConfig(payload) {
  const response = await requestJson('/api/admin/services/openai/config', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to update OpenAI config.')
  return response.data || {}
}

export async function runAdminOpenAiTestTranslation({ file, targetLanguage }) {
  const formData = new FormData()
  formData.set('file', file)
  formData.set('targetLanguage', targetLanguage)
  const response = await requestJson('/api/admin/services/openai/test-translate', {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to run OpenAI test translation.')
  return response.data || {}
}