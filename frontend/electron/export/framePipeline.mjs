import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getFrameChunkPlan, getFrameWorkerPlan, getNativeEncodePlan, runNativeFfmpeg } from './nativeFfmpeg.mjs'

function formatSeconds(seconds) {
  return Number(seconds || 0).toFixed(3)
}

function escapeConcatPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/'/g, String.raw`'\\''`)
}

function toFfmpegColor(hexColor) {
  return `0x${String(hexColor || '#050816').replace('#', '')}`
}

function buildEnableExpression(events) {
  return events
    .map((event) => `between(t,${formatSeconds(event.start)},${formatSeconds(event.end)})`)
    .join('+')
}

function buildFrameFilter(framePreset, frameBackground, overlayAssets) {
  const color = toFfmpegColor(frameBackground)
  const filterChain = [
    `[0:v]scale=w=${framePreset.width}:h=${framePreset.height}:force_original_aspect_ratio=decrease,pad=${framePreset.width}:${framePreset.height}:(ow-iw)/2:(oh-ih)/2:${color}[v0]`,
  ]

  let currentLabel = 'v0'
  overlayAssets.forEach((asset, index) => {
    const nextLabel = `v${index + 1}`
    filterChain.push(
      `[${currentLabel}][${index + 1}:v]overlay=${asset.x}:${asset.y}:shortest=1:eof_action=pass:repeatlast=0:enable='${buildEnableExpression(asset.events)}'[${nextLabel}]`,
    )
    currentLabel = nextLabel
  })

  return {
    filterComplex: filterChain.join(';'),
    outputLabel: `[${currentLabel}]`,
  }
}

async function runWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1
      if (currentIndex >= items.length) {
        return
      }

      await worker(items[currentIndex], currentIndex)
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: workerCount }, runWorker))
}

function getTimelineDurationSeconds(keptScenes) {
  return keptScenes.reduce((sum, scene) => sum + Math.max(0, Number(scene.duration) || 0), 0)
}

function buildFrameChunks(keptScenes, targetChunkDurationSeconds) {
  const chunks = []
  let timelineCursor = 0
  let currentChunk = null

  for (const scene of keptScenes) {
    const sceneDuration = Math.max(0, Number(scene.duration) || 0)
    if (sceneDuration <= 0) {
      continue
    }

    if (!currentChunk) {
      currentChunk = {
        index: chunks.length,
        start: timelineCursor,
        duration: 0,
        sceneCount: 0,
      }
    }

    const wouldOverflow = currentChunk.sceneCount > 0
      && currentChunk.duration >= targetChunkDurationSeconds * 0.65
      && currentChunk.duration + sceneDuration > targetChunkDurationSeconds

    if (wouldOverflow) {
      chunks.push(currentChunk)
      currentChunk = {
        index: chunks.length,
        start: timelineCursor,
        duration: 0,
        sceneCount: 0,
      }
    }

    currentChunk.duration += sceneDuration
    currentChunk.sceneCount += 1
    timelineCursor += sceneDuration
  }

  if (currentChunk && currentChunk.duration > 0) {
    chunks.push(currentChunk)
  }

  return chunks
}

function buildChunkOverlayAssets(overlayAssets, chunk) {
  const chunkStart = chunk.start
  const chunkEnd = chunk.start + chunk.duration

  return overlayAssets
    .map((asset) => {
      const events = (asset.events || [])
        .map((event) => ({
          start: Math.max(0, Math.max(chunkStart, event.start) - chunkStart),
          end: Math.max(0, Math.min(chunkEnd, event.end) - chunkStart),
        }))
        .filter((event) => event.end > event.start)

      if (events.length === 0) {
        return null
      }

      return {
        path: asset.path,
        x: asset.x,
        y: asset.y,
        events,
      }
    })
    .filter(Boolean)
}

function createFramingProgressEmitter(context) {
  const progressState = {
    lastEmitAt: 0,
    lastStagePercent: -1,
    lastPercent: -1,
    lastDetail: '',
  }

  return ({ force = false } = {}) => {
    const totalMicroseconds = context.chunks.reduce((sum, chunk) => sum + Math.round(chunk.duration * 1000000), 0)
    const completedMicroseconds = context.chunkProgressMicroseconds.reduce((sum, current) => sum + current, 0)
    const ratio = totalMicroseconds > 0 ? Math.min(0.999, completedMicroseconds / totalMicroseconds) : 0
    const stagePercent = Math.min(99, Math.round(ratio * 100))
    const percent = 70 + Math.round(ratio * 28)
    const activeSpeeds = context.latestSpeedByChunk.filter(Boolean)
    const speedSummary = activeSpeeds.length > 0 ? ` • ${activeSpeeds.join(' | ')}` : ''
    const detail = stagePercent >= 99
      ? `Native frame encode đang hoàn tất file${speedSummary}`
      : `Native frame encode ${stagePercent}%${speedSummary}`
    const now = Date.now()

    if (!force && progressState.lastStagePercent === stagePercent && progressState.lastPercent === percent && now - progressState.lastEmitAt < 250) {
      return
    }

    progressState.lastEmitAt = now
    progressState.lastStagePercent = stagePercent
    progressState.lastPercent = percent
    progressState.lastDetail = detail

    context.emitProgress(context.sender, context.jobId, {
      phase: 'framing',
      percent,
      stagePercent,
      ffmpegTimeMicroseconds: completedMicroseconds,
      detail,
    })
  }
}

function buildChunkOutputPath(jobDirectory, index) {
  return path.join(jobDirectory, `frame-chunk-${String(index).padStart(3, '0')}.mp4`)
}

function buildChunkArgs({ mergedPath, chunk, chunkOverlayAssets, workerPlan, framePreset, frameBackground, encoderPlan, outputPath }) {
  const overlayInputArgs = chunkOverlayAssets.flatMap((asset) => ['-loop', '1', '-i', asset.path])
  const filterPlan = buildFrameFilter(framePreset, frameBackground, chunkOverlayAssets)

  return [
    '-hide_banner',
    '-y',
    '-progress',
    'pipe:1',
    '-nostats',
    '-ss',
    formatSeconds(chunk.start),
    '-t',
    formatSeconds(chunk.duration),
    '-threads',
    String(workerPlan.decodeThreads),
    '-filter_threads',
    String(workerPlan.filterThreads),
    '-filter_complex_threads',
    String(workerPlan.filterComplexThreads),
    '-i',
    mergedPath,
    ...overlayInputArgs,
    '-filter_complex',
    filterPlan.filterComplex,
    '-map',
    filterPlan.outputLabel,
    '-map',
    '0:a?',
    '-c:v',
    encoderPlan.codec,
    ...encoderPlan.outputArgs,
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    outputPath,
  ]
}

async function concatFrameChunks({ sender, emitLog, emitProgress, jobDirectory, jobId, chunkPaths }) {
  const manifestPath = path.join(jobDirectory, 'frame-chunks.txt')
  const outputPath = path.join(jobDirectory, 'output.mp4')
  const manifestContent = `${chunkPaths.map((chunkPath) => `file '${escapeConcatPath(chunkPath)}'`).join('\n')}\n`

  await writeFile(manifestPath, manifestContent, 'utf8')

  emitLog(sender, jobId, 'framing', 'Concat native frame chunks', 'info', {
    percent: 98,
    stagePercent: 100,
    detail: `Ghép ${chunkPaths.length} chunk khung native`,
  }, {
    chunkCount: chunkPaths.length,
    manifestPath,
  })

  await runNativeFfmpeg([
    '-hide_banner',
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    manifestPath,
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    outputPath,
  ], { cwd: jobDirectory })

  return outputPath
}

export async function frameMergedVideo({
  sender,
  emitLog,
  emitProgress,
  jobId,
  jobDirectory,
  mergedPath,
  keptScenes,
  framePreset,
  frameBackground,
  overlayAssets,
}) {
  const encoderPlan = await getNativeEncodePlan()
  const totalDurationSeconds = getTimelineDurationSeconds(keptScenes)
  const chunkPlan = getFrameChunkPlan({
    encoderPlan,
    sceneCount: keptScenes.length,
    totalDurationSeconds,
  })
  const chunks = buildFrameChunks(keptScenes, chunkPlan.targetChunkDurationSeconds)
  const workerPlan = getFrameWorkerPlan({
    workerCount: chunkPlan.workerCount,
    encoderPlan,
  })
  const chunkProgressMicroseconds = chunks.map(() => 0)
  const latestSpeedByChunk = chunks.map(() => '')
  const chunkPaths = new Array(chunks.length)
  const emitAggregateProgress = createFramingProgressEmitter({
    sender,
    emitProgress,
    jobId,
    chunks,
    chunkProgressMicroseconds,
    latestSpeedByChunk,
  })

  emitLog(sender, jobId, 'framing', `Start native chunked frame encode with ${encoderPlan.label}`, 'info', {
    percent: 70,
    stagePercent: 0,
    detail: `Dựng khung ${framePreset.label} bằng ${encoderPlan.label} • ${chunks.length} chunk / ${chunkPlan.workerCount} worker`,
  }, {
    encoder: encoderPlan,
    chunkPlan,
    frameWorkerPlan: workerPlan,
    overlayCount: overlayAssets.length,
    chunkCount: chunks.length,
  })

  await runWithConcurrency(chunks, chunkPlan.workerCount, async (chunk) => {
    const chunkOverlayAssets = buildChunkOverlayAssets(overlayAssets, chunk)
    const outputPath = buildChunkOutputPath(jobDirectory, chunk.index)
    chunkPaths[chunk.index] = outputPath

    emitLog(sender, jobId, 'framing', `Start frame chunk ${chunk.index + 1}/${chunks.length}`, 'info', {}, {
      chunkIndex: chunk.index,
      chunkStart: chunk.start,
      chunkDuration: chunk.duration,
      overlayCount: chunkOverlayAssets.length,
    })

    await runNativeFfmpeg(buildChunkArgs({
      mergedPath,
      chunk,
      chunkOverlayAssets,
      workerPlan,
      framePreset,
      frameBackground,
      encoderPlan,
      outputPath,
    }), {
      cwd: jobDirectory,
      onStdoutLine: (line) => {
        const [key, rawValue] = line.split('=', 2)
        if (key === 'speed') {
          latestSpeedByChunk[chunk.index] = String(rawValue || '').trim()
          emitAggregateProgress()
          return
        }

        if (key === 'progress' && rawValue === 'end') {
          chunkProgressMicroseconds[chunk.index] = Math.round(chunk.duration * 1000000)
          latestSpeedByChunk[chunk.index] = ''
          emitAggregateProgress({ force: true })
          return
        }

        if (key !== 'out_time_ms' && key !== 'out_time_us') {
          return
        }

        chunkProgressMicroseconds[chunk.index] = Math.min(
          Math.round(chunk.duration * 1000000),
          Math.max(0, Number(rawValue) || 0),
        )
        emitAggregateProgress()
      },
    })

    chunkProgressMicroseconds[chunk.index] = Math.round(chunk.duration * 1000000)
    latestSpeedByChunk[chunk.index] = ''
    emitLog(sender, jobId, 'framing', `Finished frame chunk ${chunk.index + 1}/${chunks.length}`, 'info', {}, {
      chunkIndex: chunk.index,
      outputPath,
    })
    emitAggregateProgress({ force: true })
  })

  const outputPath = await concatFrameChunks({
    sender,
    emitLog,
    emitProgress,
    jobDirectory,
    jobId,
    chunkPaths,
  })

  emitProgress(sender, jobId, {
    phase: 'framing',
    percent: 98,
    stagePercent: 100,
    detail: 'Đã dựng xong video khung native',
  })
  emitLog(sender, jobId, 'framing', 'Native chunked frame encode completed', 'info', {}, {
    chunkCount: chunks.length,
    outputPath,
  })

  return {
    outputPath,
    encoderPlan,
  }
}