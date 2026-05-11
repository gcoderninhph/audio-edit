import { app, dialog, shell } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

function sanitizeExportFileName(fileName, fallback = 'output') {
  const normalizedName = String(fileName || fallback).replace(/\.[^.]+$/, '').trim()
  const sanitizedName = normalizedName.replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_').replace(/\s+/g, ' ').replace(/\.+$/, '').trim()

  return sanitizedName || fallback
}

export function buildExportFileName(fileName, extension = '.mp4') {
  return `${sanitizeExportFileName(fileName)}${extension}`
}

export function resolveExportOutputTarget(outputTarget = {}, fallbackFileName = 'output.mp4') {
  const directory = typeof outputTarget?.directory === 'string' && outputTarget.directory.trim()
    ? outputTarget.directory.trim()
    : app.getPath('downloads')
  const fileName = buildExportFileName(outputTarget?.fileName || fallbackFileName)

  return {
    directory,
    fileName,
    filePath: path.join(directory, fileName),
  }
}

function toBuffer(bytes) {
  if (!bytes) {
    return Buffer.alloc(0)
  }

  if (Buffer.isBuffer(bytes)) {
    return bytes
  }

  if (bytes instanceof ArrayBuffer) {
    return Buffer.from(bytes)
  }

  if (ArrayBuffer.isView(bytes)) {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  if (Array.isArray(bytes)) {
    return Buffer.from(bytes)
  }

  throw new Error('Unsupported binary payload received while saving the export file.')
}

async function saveExportBytes(payload = {}) {
  const outputTarget = resolveExportOutputTarget(payload.outputTarget, payload.fallbackFileName || 'output.mp4')
  const bytes = toBuffer(payload.bytes)

  await mkdir(outputTarget.directory, { recursive: true })
  await writeFile(outputTarget.filePath, bytes)

  return {
    fileName: outputTarget.fileName,
    filePath: outputTarget.filePath,
    size: bytes.byteLength,
  }
}

async function chooseExportDirectory() {
  const result = await dialog.showOpenDialog({
    buttonLabel: 'Use this folder',
    defaultPath: app.getPath('downloads'),
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose export folder',
  })

  return result.canceled ? null : result.filePaths[0] || null
}

function revealExportFile(filePath) {
  if (!filePath) {
    return false
  }

  shell.showItemInFolder(path.normalize(filePath))
  return true
}

export function registerExportOutputIpc(ipcMain) {
  ipcMain.handle('export-output:get-default-directory', () => app.getPath('downloads'))
  ipcMain.handle('export-output:choose-directory', () => chooseExportDirectory())
  ipcMain.handle('export-output:save-bytes', (_event, payload) => saveExportBytes(payload))
  ipcMain.handle('export-output:reveal-file', (_event, filePath) => revealExportFile(filePath))
}