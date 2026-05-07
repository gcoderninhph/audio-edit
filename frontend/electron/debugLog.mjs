import { app } from 'electron'
import { appendFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'

const LOG_DIR_NAME = 'logs'
const LOG_FILE_NAME = 'export-debug.jsonl'
const LOG_ARCHIVE_FILE_NAME = 'export-debug.previous.jsonl'
const MAX_LOG_BYTES = 2 * 1024 * 1024

let writeChain = Promise.resolve()

function getLogDirectory() {
  return path.join(app.getPath('userData'), LOG_DIR_NAME)
}

export function getDebugLogFilePath() {
  return path.join(getLogDirectory(), LOG_FILE_NAME)
}

function normalizeLevel(level) {
  return ['debug', 'info', 'warning', 'error'].includes(level) ? level : 'info'
}

function sanitizeValue(value, depth = 0) {
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
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 25)
        .map(([key, nestedValue]) => [key, sanitizeValue(nestedValue, depth + 1)]),
    )
  }

  return String(value)
}

async function ensureLogDirectory() {
  await mkdir(getLogDirectory(), { recursive: true })
}

async function rotateLogIfNeeded() {
  const logFilePath = getDebugLogFilePath()

  try {
    const logStats = await stat(logFilePath)
    if (logStats.size < MAX_LOG_BYTES) {
      return
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return
    }

    throw error
  }

  const archiveFilePath = path.join(getLogDirectory(), LOG_ARCHIVE_FILE_NAME)
  await rm(archiveFilePath, { force: true })
  await rename(logFilePath, archiveFilePath)
}

function buildLogEntry(entry = {}) {
  return {
    timestamp: new Date().toISOString(),
    level: normalizeLevel(entry.level),
    scope: entry.scope || 'desktop',
    message: String(entry.message || ''),
    data: sanitizeValue(entry.data ?? null),
    pid: process.pid,
  }
}

export function appendDebugLog(entry) {
  const logLine = `${JSON.stringify(buildLogEntry(entry))}\n`

  writeChain = writeChain
    .then(async () => {
      await ensureLogDirectory()
      await rotateLogIfNeeded()
      await appendFile(getDebugLogFilePath(), logLine, 'utf8')
    })
    .catch((error) => {
      console.error('Failed to write debug log file', error)
    })

  return writeChain
}

export async function readDebugLogTail(maxLines = 120) {
  try {
    const content = await readFile(getDebugLogFilePath(), 'utf8')
    return content.split(/\r?\n/).filter(Boolean).slice(-Math.max(1, maxLines))
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return []
    }

    throw error
  }
}

export function registerDebugLogIpc(ipcMain) {
  ipcMain.handle('debug-log:write', async (_event, entry) => {
    await appendDebugLog(entry)
    return { path: getDebugLogFilePath() }
  })
  ipcMain.handle('debug-log:path', () => getDebugLogFilePath())
  ipcMain.handle('debug-log:tail', (_event, maxLines) => readDebugLogTail(maxLines))
}