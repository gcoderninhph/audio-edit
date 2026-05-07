function getDebugLogBridge() {
  return window.desktopBridge?.debugLog || null
}

function sanitizeData(value, depth = 0) {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }

  if (depth >= 2) {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeData(item, depth + 1))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 25)
        .map(([key, nestedValue]) => [key, sanitizeData(nestedValue, depth + 1)]),
    )
  }

  return String(value)
}

export async function writeDesktopDebugLog({ scope = 'renderer', message, data = null, level = 'info' }) {
  const debugLogBridge = getDebugLogBridge()
  if (!debugLogBridge) {
    return null
  }

  try {
    return await debugLogBridge.write({
      scope,
      message,
      data: sanitizeData(data),
      level,
    })
  } catch (error) {
    console.warn('Failed to write desktop debug log', error)
    return null
  }
}

export function logExportDebug(message, data = null, level = 'info') {
  return writeDesktopDebugLog({
    scope: 'export',
    message,
    data,
    level,
  })
}

export function getDesktopDebugLogPath() {
  const debugLogBridge = getDebugLogBridge()
  return debugLogBridge?.getPath?.() || Promise.resolve(null)
}

export function readDesktopDebugTail(maxLines = 120) {
  const debugLogBridge = getDebugLogBridge()
  return debugLogBridge?.tail?.(maxLines) || Promise.resolve([])
}