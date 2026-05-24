import { spawn } from 'node:child_process'
import os from 'node:os'
import ffmpegPath from 'ffmpeg-static'
import { buildNativeEncoderOutputArgs } from '../../src/utils/exportQualityProfile.js'

const HARDWARE_ENCODERS = [
  {
    codec: 'h264_nvenc',
    label: 'nvidia-nvenc',
  },
  {
    codec: 'h264_qsv',
    label: 'intel-qsv',
  },
  {
    codec: 'h264_amf',
    label: 'amd-amf',
  },
]

export const DEFAULT_NATIVE_FRAME_RATE = 60

let cachedEncoderPlanPromise = null

function getLogicalCpuCount() {
  return Math.max(1, os.cpus()?.length || 1)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizeCount(value) {
  return Math.max(0, Math.floor(Number(value) || 0))
}

function normalizeSeconds(value) {
  return Math.max(0, Number(value) || 0)
}

function parseFrameRateValue(value) {
  const normalizedValue = String(value || '').trim().toLowerCase()
  if (!normalizedValue) {
    return 0
  }

  const multiplier = normalizedValue.endsWith('k') ? 1000 : 1
  const numericValue = normalizedValue.replace(/k$/, '')
  if (numericValue.includes('/')) {
    const [rawNumerator, rawDenominator] = numericValue.split('/', 2)
    const numerator = Number(rawNumerator)
    const denominator = Number(rawDenominator)
    return denominator > 0 ? (numerator / denominator) * multiplier : 0
  }

  return Number(numericValue) * multiplier
}

function parseVideoFrameRate(output) {
  const lines = String(output || '').split(/\r?\n/)
  const videoLine = lines.find((line) => /video:/i.test(line)) || lines.join(' ')
  const fpsMatch = videoLine.match(/,\s*([0-9.]+(?:\/[0-9.]+)?k?)\s*fps\b/i)
  const tbrMatch = videoLine.match(/,\s*([0-9.]+(?:\/[0-9.]+)?k?)\s*tbr\b/i)

  return parseFrameRateValue(fpsMatch?.[1]) || parseFrameRateValue(tbrMatch?.[1])
}

function parseVideoDimensions(output) {
  const lines = String(output || '').split(/\r?\n/)
  const videoLine = lines.find((line) => /video:/i.test(line)) || lines.join(' ')
  const match = videoLine.match(/,\s*(\d{2,5})x(\d{2,5})(?:[\s,\[]|$)/i)
  if (!match) {
    return { height: 0, width: 0 }
  }

  return {
    height: Number(match[2]) || 0,
    width: Number(match[1]) || 0,
  }
}

export function normalizeNativeFrameRate(frameRate) {
  const normalizedFrameRate = Number(frameRate) || 0
  if (normalizedFrameRate < 1 || normalizedFrameRate > 120) {
    return DEFAULT_NATIVE_FRAME_RATE
  }

  return Number(normalizedFrameRate.toFixed(3))
}

function createExportError(message, code = 'NATIVE_EXPORT_FAILED') {
  const error = new Error(message)
  error.code = code
  return error
}

function attachLineReader(stream, onLine) {
  if (!stream || typeof onLine !== 'function') {
    return
  }

  let buffered = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffered += chunk
    const lines = buffered.split(/\r?\n/)
    buffered = lines.pop() || ''
    for (const line of lines) {
      onLine(line)
    }
  })
  stream.on('end', () => {
    const line = buffered.trim()
    if (line) {
      onLine(line)
    }
  })
}

export function getNativeFfmpegPath() {
  if (!ffmpegPath) {
    throw createExportError('Bundled FFmpeg binary is not available in this desktop build.', 'NATIVE_EXPORT_UNAVAILABLE')
  }

  return ffmpegPath
}

export function getSceneWorkerPlan({ sceneCount = 0, totalDurationSeconds = 0 } = {}) {
  const logicalCpuCount = getLogicalCpuCount()
  const normalizedSceneCount = normalizeCount(sceneCount)
  const normalizedDurationSeconds = normalizeSeconds(totalDurationSeconds)
  const cpuBudget = Math.max(2, Math.floor(logicalCpuCount * 0.95))
  const aggressiveConcurrency = normalizedDurationSeconds >= 180 || normalizedSceneCount >= 8
  const baseWorkerCount = clamp(Math.ceil(logicalCpuCount / (aggressiveConcurrency ? 2.5 : 3.5)), 2, 12)
  const workerCount = normalizedSceneCount > 0
    ? clamp(Math.min(normalizedSceneCount, baseWorkerCount), 1, 12)
    : baseWorkerCount
  const threadsPerWorker = clamp(Math.floor(cpuBudget / Math.max(workerCount, 1)) || 1, 1, 12)

  return {
    logicalCpuCount,
    cpuBudget,
    workerCount,
    threadsPerWorker,
    sceneCount: normalizedSceneCount,
    totalDurationSeconds: normalizedDurationSeconds,
  }
}

export function getFrameChunkPlan({ encoderPlan = null, sceneCount = 0, totalDurationSeconds = 0 } = {}) {
  const logicalCpuCount = getLogicalCpuCount()
  const normalizedSceneCount = normalizeCount(sceneCount)
  const normalizedDurationSeconds = normalizeSeconds(totalDurationSeconds)
  const hardware = Boolean(encoderPlan?.hardware)
  const minChunkDurationSeconds = hardware ? 6 : 2.5
  const maxChunkDurationSeconds = hardware ? 14 : 8
  const queueDepth = hardware ? 2 : 5
  const baseWorkerCeiling = hardware ? 4 : 12
  const baseWorkerFloor = hardware ? 1 : 2
  const baseWorkerCount = clamp(
    hardware ? Math.ceil(logicalCpuCount / 8) : Math.ceil(logicalCpuCount / 2),
    baseWorkerFloor,
    baseWorkerCeiling,
  )
  const maxWorkersByDuration = normalizedDurationSeconds > 0
    ? Math.max(1, Math.ceil(normalizedDurationSeconds / minChunkDurationSeconds))
    : baseWorkerCount
  const workerCount = clamp(
    Math.min(baseWorkerCount, maxWorkersByDuration),
    1,
    baseWorkerCeiling,
  )
  const targetChunkCount = Math.max(workerCount, workerCount * queueDepth)
  const targetChunkDurationSeconds = normalizedDurationSeconds > 0
    ? clamp(normalizedDurationSeconds / targetChunkCount, minChunkDurationSeconds, maxChunkDurationSeconds)
    : hardware ? 12 : 18

  return {
    logicalCpuCount,
    workerCount,
    sceneCount: normalizedSceneCount,
    totalDurationSeconds: normalizedDurationSeconds,
    queueDepth,
    targetChunkCount,
    targetChunkDurationSeconds,
  }
}

export function getFrameWorkerPlan({ workerCount = 1, encoderPlan = null } = {}) {
  const logicalCpuCount = getLogicalCpuCount()
  const hardware = Boolean(encoderPlan?.hardware)
  const cpuBudget = Math.max(2, Math.floor(logicalCpuCount * (hardware ? 0.95 : 1)))
  const cpuBudgetPerWorker = Math.max(1, Math.floor(cpuBudget / Math.max(1, workerCount)))

  return {
    logicalCpuCount,
    cpuBudget,
    decodeThreads: clamp(cpuBudgetPerWorker, hardware ? 2 : 1, hardware ? 6 : 6),
    encodeThreads: hardware ? 1 : clamp(cpuBudgetPerWorker, 1, 6),
    filterThreads: clamp(Math.ceil(cpuBudgetPerWorker * 0.75), hardware ? 2 : 1, hardware ? 6 : 6),
    filterComplexThreads: clamp(Math.ceil(cpuBudgetPerWorker * 0.5), 1, hardware ? 4 : 4),
  }
}

export function runNativeFfmpeg(args, { cwd, onStdoutLine, onStderrLine } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    const outputTail = []
    const child = spawn(getNativeFfmpegPath(), args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const rememberLine = (line) => {
      if (!line) {
        return
      }

      outputTail.push(line)
      if (outputTail.length > 80) {
        outputTail.shift()
      }
    }

    attachLineReader(child.stdout, (line) => {
      rememberLine(line)
      onStdoutLine?.(line)
    })
    attachLineReader(child.stderr, (line) => {
      rememberLine(line)
      onStderrLine?.(line)
    })

    child.on('error', (error) => {
      if (settled) {
        return
      }

      settled = true
      reject(createExportError(`Failed to start native FFmpeg: ${error.message}`, 'NATIVE_EXPORT_UNAVAILABLE'))
    })

    child.on('close', (code, signal) => {
      if (settled) {
        return
      }

      settled = true
      if (code === 0) {
        resolve({ code: 0 })
        return
      }

      const tail = outputTail.slice(-12).join('\n')
      const reason = signal ? `signal ${signal}` : `code ${code}`
      reject(createExportError(`Native FFmpeg exited with ${reason}.${tail ? `\n${tail}` : ''}`))
    })
  })
}

async function readAvailableEncoders() {
  const outputLines = []
  await runNativeFfmpeg(['-hide_banner', '-encoders'], {
    onStdoutLine: (line) => outputLines.push(line),
    onStderrLine: (line) => outputLines.push(line),
  })
  return outputLines.join('\n')
}

async function canUseHardwareEncoder(codec) {
  try {
    await runNativeFfmpeg([
      '-hide_banner',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=256x144:r=30:d=0.1',
      '-frames:v',
      '1',
      '-an',
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      codec,
      '-f',
      'null',
      '-',
    ])
    return true
  } catch {
    return false
  }
}

export async function readNativeVideoMetadata(inputPath) {
  const outputLines = []

  try {
    await runNativeFfmpeg([
      '-hide_banner',
      '-nostats',
      '-i',
      inputPath,
      '-map',
      '0:v:0',
      '-frames:v',
      '1',
      '-f',
      'null',
      '-',
    ], {
      onStdoutLine: (line) => outputLines.push(line),
      onStderrLine: (line) => outputLines.push(line),
    })
  } catch {
    return { frameRate: DEFAULT_NATIVE_FRAME_RATE, height: 0, width: 0 }
  }

  const output = outputLines.join('\n')
  const dimensions = parseVideoDimensions(output)
  return {
    ...dimensions,
    frameRate: normalizeNativeFrameRate(parseVideoFrameRate(output)),
  }
}

export async function readNativeVideoFrameRate(inputPath) {
  return (await readNativeVideoMetadata(inputPath)).frameRate
}

export async function getNativeEncodePlan(exportQualityProfileId) {
  if (!cachedEncoderPlanPromise) {
    cachedEncoderPlanPromise = (async () => {
      const encoderOutput = await readAvailableEncoders()

      for (const encoder of HARDWARE_ENCODERS) {
        if (encoderOutput.includes(encoder.codec) && await canUseHardwareEncoder(encoder.codec)) {
          return {
            ...encoder,
            hardware: true,
            verified: true,
          }
        }
      }

      return {
        codec: 'libx264',
        label: 'cpu-libx264',
        hardware: false,
        verified: true,
      }
    })().catch((error) => {
      cachedEncoderPlanPromise = null
      throw error
    })
  }

  const basePlan = await cachedEncoderPlanPromise

  return {
    ...basePlan,
    outputArgs: buildNativeEncoderOutputArgs(basePlan.codec, exportQualityProfileId),
  }
}