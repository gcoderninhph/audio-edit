const FALLBACK_SERVER_URL = 'https://audio-test.accstore.pro.vn'

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) {
    return FALLBACK_SERVER_URL
  }

  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function getDesktopRuntimeConfig() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.desktopBridge?.getRuntimeConfig?.() || null
  } catch {
    return null
  }
}

function normalizePath(pathname = '') {
  if (!pathname) {
    return ''
  }

  return pathname.startsWith('/') ? pathname : `/${pathname}`
}

export function getServerUrl() {
  const desktopConfig = getDesktopRuntimeConfig()
  if (desktopConfig?.serverUrl) {
    return normalizeBaseUrl(desktopConfig.serverUrl)
  }

  if (import.meta.env.VITE_API_ORIGIN) {
    return normalizeBaseUrl(import.meta.env.VITE_API_ORIGIN)
  }

  if (typeof window !== 'undefined' && /^https?:/.test(window.location.origin)) {
    return normalizeBaseUrl(window.location.origin)
  }

  return FALLBACK_SERVER_URL
}

export function buildServerUrl(pathname = '') {
  return `${getServerUrl()}${normalizePath(pathname)}`
}

export function apiFetch(pathname, options) {
  return fetch(buildServerUrl(pathname), options)
}

export function isDeveloperMode() {
  const desktopConfig = getDesktopRuntimeConfig()
  return desktopConfig?.isDeveloper === true
}