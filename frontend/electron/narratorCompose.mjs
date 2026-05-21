import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { runNativeFfmpeg } from './export/nativeFfmpeg.mjs'
import { loadProjectVoiceoverSegmentFile, saveProjectVoiceoverSegmentFile } from './projectVoiceoverSegmentStore.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const NARRATOR_SAMPLE_RATE = 44100
const NARRATOR_CHANNELS = 2

function toManifestMs(value) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 0
  return Math.max(0, Math.round(numericValue))
}

function normalizeBytes(bytes) {
  if (!bytes) return new Uint8Array()
  if (bytes instanceof Uint8Array) return bytes
  if (Array.isArray(bytes)) return Uint8Array.from(bytes)
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes)
  return Uint8Array.from(bytes)
}

function inferExtension({ fileName = '', mimeType = '' } = {}) {
  const fileExtension = path.extname(String(fileName || '')).toLowerCase()
  if (fileExtension) return fileExtension
  if (/wav/i.test(mimeType)) return '.wav'
  if (/mpeg|mp3/i.test(mimeType)) return '.mp3'
  if (/ogg/i.test(mimeType)) return '.ogg'
  if (/mp4|aac/i.test(mimeType)) return '.m4a'
  return '.audio'
}

function getNarratorExecutablePath() {
  const candidates = [
    path.join(__dirname, 'bin', 'narrator-compose.exe'),
    path.join(process.resourcesPath || '', 'bin', 'narrator-compose.exe'),
    path.join(process.resourcesPath || '', 'electron', 'bin', 'narrator-compose.exe'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'electron', 'bin', 'narrator-compose.exe'),
  ].filter(Boolean)
  const executablePath = candidates.find((candidate) => existsSync(candidate))
  if (!executablePath) {
    throw new Error('Bundled narrator-compose.exe is not available in this desktop build.')
  }
  return executablePath
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const stdoutLines = []
    const stderrLines = []
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => stdoutLines.push(chunk))
    child.stderr.on('data', (chunk) => stderrLines.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      const stdout = stdoutLines.join('')
      const stderr = stderrLines.join('')
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new Error(`Narrator compose failed with code ${code}.${stderr ? ` ${stderr}` : ''}`))
    })
  })
}

async function downloadAudioUrl({ url, projectId, segmentHash }) {
  const storedSegment = await loadProjectVoiceoverSegmentFile(projectId, segmentHash).catch(() => null)
  if (storedSegment) {
    return storedSegment
  }
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Unable to download Vbee audio: ${response.status}`)
  }
  const contentDisposition = response.headers.get('content-disposition') || ''
  const fileNameMatch = contentDisposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i)
  const downloadResult = {
    bytes: new Uint8Array(await response.arrayBuffer()),
    fileName: fileNameMatch ? decodeURIComponent(fileNameMatch[1]).replace(/^"|"$/g, '') : 'vbee-segment.audio',
    mimeType: response.headers.get('content-type') || 'application/octet-stream',
  }
  if (projectId && segmentHash) {
    const storedResult = await saveProjectVoiceoverSegmentFile(projectId, segmentHash, downloadResult).catch(() => null)
    if (storedResult) {
      return { ...downloadResult, ...storedResult }
    }
  }
  return downloadResult
}

async function writeNormalizedSegment(tempDir, segment, index) {
  const inputPath = path.join(tempDir, `segment-${String(index).padStart(4, '0')}${inferExtension(segment)}`)
  const wavPath = path.join(tempDir, `segment-${String(index).padStart(4, '0')}.wav`)
  await writeFile(inputPath, normalizeBytes(segment.bytes))
  await runNativeFfmpeg([
    '-hide_banner',
    '-y',
    '-i', inputPath,
    '-ar', String(NARRATOR_SAMPLE_RATE),
    '-ac', String(NARRATOR_CHANNELS),
    wavPath,
  ])
  const startMs = toManifestMs(segment.startMs)
  const endMs = Math.max(startMs, toManifestMs(segment.endMs))
  return {
    duration_ms: Math.max(0, endMs - startMs),
    end_ms: endMs,
    path: wavPath,
    start_ms: startMs,
  }
}

async function composeNarration(payload = {}) {
  const segments = Array.isArray(payload.segments) ? payload.segments : []
  if (!segments.length) {
    throw new Error('No Vbee audio segments were provided for narrator compose.')
  }
  const tempDir = await mkdtemp(path.join(os.tmpdir(), `audio-edit-narrator-${randomUUID()}-`))
  try {
    const outputPath = path.join(tempDir, 'voiceover.wav')
    const manifestPath = path.join(tempDir, 'manifest.json')
    const manifestSegments = []
    for (const [index, segment] of segments.entries()) {
      manifestSegments.push(await writeNormalizedSegment(tempDir, segment, index))
    }
    const totalDurationMs = Math.max(toManifestMs(payload.totalDurationMs), ...manifestSegments.map((segment) => segment.end_ms || 0))
    await writeFile(manifestPath, JSON.stringify({
      channels: NARRATOR_CHANNELS,
      cleanup_inputs: false,
      output_format: 'wav',
      output_path: outputPath,
      sample_rate: NARRATOR_SAMPLE_RATE,
      segments: manifestSegments,
      total_duration_ms: totalDurationMs,
    }, null, 2))
    await runProcess(getNarratorExecutablePath(), ['compose', '--manifest', manifestPath], { cwd: tempDir })
    return {
      bytes: new Uint8Array(await readFile(outputPath)),
      duration: totalDurationMs / 1000,
      fileName: `voiceover-${payload.requestId || Date.now()}.wav`,
      mimeType: 'audio/wav',
    }
  } finally {
    await rm(tempDir, { force: true, recursive: true }).catch(() => undefined)
  }
}

export function registerNarratorComposeIpc(ipcMain) {
  ipcMain.handle('narrator-compose:download-audio', (_event, payload) => downloadAudioUrl(payload))
  ipcMain.handle('narrator-compose:compose', (_event, payload) => composeNarration(payload))
}