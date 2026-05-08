import { spawn } from 'node:child_process'
import os from 'node:os'
import ffmpegPath from 'ffmpeg-static'

const HARDWARE_ENCODERS = [
  {
    codec: 'h264_nvenc',
    label: 'nvidia-nvenc',
    outputArgs: ['-cq', '21', '-preset', 'p3'],
  },
  {
    codec: 'h264_qsv',
    label: 'intel-qsv',
    outputArgs: ['-global_quality', '22', '-preset', 'veryfast'],
  },
  {
    codec: 'h264_amf',
    label: 'amd-amf',
    outputArgs: ['-quality', 'speed', '-usage', 'transcoding'],
  },
]

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
  const minChunkDurationSeconds = hardware ? 4 : 8
  const maxChunkDurationSeconds = hardware ? 12 : 18
  const queueDepth = hardware ? 4 : 3
  const baseWorkerCeiling = hardware ? 12 : 8
  const baseWorkerFloor = hardware ? 2 : 1
  const baseWorkerCount = clamp(
    Math.ceil(logicalCpuCount / (hardware ? 3 : 4)),
    baseWorkerFloor,
    baseWorkerCeiling,
  )
  const maxWorkersByDuration = normalizedDurationSeconds > 0
    ? Math.max(1, Math.floor(normalizedDurationSeconds / minChunkDurationSeconds))
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
  const cpuBudget = Math.max(2, Math.floor(logicalCpuCount * (encoderPlan?.hardware ? 0.85 : 0.95)))
  const cpuBudgetPerWorker = Math.max(2, Math.floor(cpuBudget / Math.max(1, workerCount)))

  return {
    logicalCpuCount,
    cpuBudget,
    decodeThreads: clamp(cpuBudgetPerWorker, 2, encoderPlan?.hardware ? 8 : 12),
    filterThreads: clamp(Math.ceil(cpuBudgetPerWorker / 2), 2, 6),
    filterComplexThreads: clamp(Math.ceil(cpuBudgetPerWorker / 3), 1, 4),
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

export async function getNativeEncodePlan() {
  if (!cachedEncoderPlanPromise) {
    cachedEncoderPlanPromise = (async () => {
      const encoderOutput = await readAvailableEncoders()

      for (const encoder of HARDWARE_ENCODERS) {
        if (encoderOutput.includes(encoder.codec)) {
          return {
            ...encoder,
            hardware: true,
          }
        }
      }

      return {
        codec: 'libx264',
        label: 'cpu-libx264',
        outputArgs: ['-preset', 'superfast', '-crf', '20'],
        hardware: false,
      }
    })().catch((error) => {
      cachedEncoderPlanPromise = null
      throw error
    })
  }

  return cachedEncoderPlanPromise
}