const SESSION_STORAGE_KEY = 'videoforge-admin-web-session'

async function performJsonRequest(path, options = {}) {
  try {
    const response = await fetch(path, options)
    let data = null
    try {
      data = await response.json()
    } catch {
      data = null
    }
    return { ok: response.ok, status: response.status, data }
  } catch (error) {
    return { ok: false, status: 0, data: { error: error?.message || 'Request failed' } }
  }
}

export function getStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

export function setStoredSession(session) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session || null))
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY)
}

export function mergeSessionPayload(payload = {}) {
  const currentSession = getStoredSession()
  const nextSession = {
    accessToken: payload.accessToken || currentSession?.accessToken || '',
    accessTokenExpiresAt: payload.accessTokenExpiresAt || currentSession?.accessTokenExpiresAt || 0,
    refreshToken: payload.refreshToken || currentSession?.refreshToken || '',
    refreshTokenExpiresAt: payload.refreshTokenExpiresAt || currentSession?.refreshTokenExpiresAt || 0,
    user: payload.user || currentSession?.user || null,
  }
  setStoredSession(nextSession)
  return nextSession
}

export function getIdentityLabel(user) {
  return user?.displayName || user?.username || user?.email || 'Guest'
}

export function resolveAdminDestination(session) {
  if (!session?.user) return '/admin/login'
  if (session.user.mustSetupAdmin) return '/admin/setup'
  if (session.user.role === 'admin') return '/admin/manage'
  return '/admin/login'
}

async function refreshSession() {
  const currentSession = getStoredSession()
  if (!currentSession?.refreshToken) return null
  const response = await performJsonRequest('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: currentSession.refreshToken }),
  })
  if (!response.ok) {
    clearStoredSession()
    return null
  }
  return mergeSessionPayload(response.data || {})
}

export async function requestJson(path, options = {}, allowRefresh = true) {
  const headers = new Headers(options.headers || {})
  const currentSession = getStoredSession()
  if (currentSession?.accessToken) headers.set('Authorization', `Bearer ${currentSession.accessToken}`)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const response = await performJsonRequest(path, { ...options, headers })
  if (response.status === 401 && allowRefresh && currentSession?.refreshToken) {
    const refreshedSession = await refreshSession()
    if (refreshedSession) return requestJson(path, options, false)
  }
  return response
}

export async function syncCurrentUser() {
  const currentSession = getStoredSession()
  if (!currentSession?.accessToken) return null
  const response = await requestJson('/api/auth/me', { method: 'GET' })
  if (!response.ok) {
    clearStoredSession()
    return null
  }
  return mergeSessionPayload(response.data || {})
}

export async function loginAdmin(identifier, password) {
  const response = await requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: identifier, password }),
  }, false)
  if (!response.ok) throw new Error(response.data?.error || 'Login failed.')
  return mergeSessionPayload(response.data || {})
}

export async function logoutCurrentSession() {
  const currentSession = getStoredSession()
  if (currentSession?.refreshToken) {
    await requestJson('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: currentSession.refreshToken }),
    }, false)
  }
  clearStoredSession()
}

export async function completeAdminSetup(payload) {
  const response = await requestJson('/api/admin/bootstrap/complete', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to create admin account.')
  return mergeSessionPayload(response.data || {})
}

export async function fetchAdminUsers({ page = 1, pageSize = 10, search = '' } = {}) {
  const searchParams = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (search) searchParams.set('search', search)
  const response = await requestJson(`/api/admin/users?${searchParams.toString()}`)
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load users.')
  return response.data || {}
}

export async function fetchAdminIapPackages() {
  const response = await requestJson('/api/admin/iap/packages')
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load IAP packages.')
  return response.data || {}
}

export async function createAdminIapPackage(payload) {
  const response = await requestJson('/api/admin/iap/packages', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to create IAP package.')
  return response.data || {}
}

export async function updateAdminIapPackage(packageId, payload) {
  const response = await requestJson(`/api/admin/iap/packages/${encodeURIComponent(packageId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to update IAP package.')
  return response.data || {}
}

export async function deleteAdminIapPackage(packageId) {
  const response = await requestJson(`/api/admin/iap/packages/${encodeURIComponent(packageId)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to delete IAP package.')
  return response.data || {}
}

export async function fetchAdminIapApiKeys() {
  const response = await requestJson('/api/admin/iap/api-keys')
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load IAP API keys.')
  return response.data || {}
}

export async function createAdminIapApiKey(payload) {
  const response = await requestJson('/api/admin/iap/api-keys', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to create IAP API key.')
  return response.data || {}
}

export async function deleteAdminIapApiKey(keyId) {
  const response = await requestJson(`/api/admin/iap/api-keys/${encodeURIComponent(keyId)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to delete IAP API key.')
  return response.data || {}
}

export async function fetchAdminIapPackFunctions() {
  const response = await requestJson('/api/admin/iap/pack-functions')
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load IAP pack functions.')
  return response.data || {}
}

export async function createAdminIapPackFunction(payload) {
  const response = await requestJson('/api/admin/iap/pack-functions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to create IAP pack function.')
  return response.data || {}
}

export async function deleteAdminIapPackFunction(recordId) {
  const response = await requestJson(`/api/admin/iap/pack-functions/${encodeURIComponent(recordId)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to delete IAP pack function.')
  return response.data || {}
}

export async function fetchAdminIapSales() {
  const response = await requestJson('/api/admin/iap/sales')
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load IAP sales.')
  return response.data || {}
}

export async function createAdminIapSale(payload) {
  const response = await requestJson('/api/admin/iap/sales', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to create IAP sale.')
  return response.data || {}
}

export async function deleteAdminIapSale(saleId) {
  const response = await requestJson(`/api/admin/iap/sales/${encodeURIComponent(saleId)}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to delete IAP sale.')
  return response.data || {}
}

export async function fetchAdminUser(userId) {
  const response = await requestJson(`/api/admin/users/${encodeURIComponent(userId)}`)
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load user.')
  return response.data || {}
}

export async function updateAdminUser(userId, updates) {
  const response = await requestJson(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to update user.')
  return response.data || {}
}

export async function fetchUserRequests(userId, { page = 1, pageSize = 10 } = {}) {
  const response = await requestJson(`/api/admin/users/${encodeURIComponent(userId)}/requests?page=${page}&pageSize=${pageSize}`)
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load requests.')
  return response.data || {}
}

export async function fetchCreditHistory(userId, { page = 1, pageSize = 10 } = {}) {
  const response = await requestJson(`/api/admin/users/${encodeURIComponent(userId)}/credits/history?page=${page}&pageSize=${pageSize}`)
  if (!response.ok) throw new Error(response.data?.error || 'Unable to load credit history.')
  return response.data || {}
}

export async function addUserCredits(userId, amount, note) {
  const response = await requestJson(`/api/admin/users/${encodeURIComponent(userId)}/credits/add`, {
    method: 'POST',
    body: JSON.stringify({ amount, note }),
  })
  if (!response.ok) throw new Error(response.data?.error || 'Unable to add credits.')
  return response.data || {}
}