import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildFrameFilter, getNativeBackgroundImagePath } from './frameFilterGraph.mjs'
import { buildChunkSceneMotionSegments, buildFrameSceneMotionSegments } from './frameMotionFilter.mjs'
import { getFrameChunkPlan, getFrameWorkerPlan, getNativeEncodePlan, readNativeVideoFrameRate, runNativeFfmpeg } from './nativeFfmpeg.mjs'

function formatSeconds(seconds) {
  return Number(seconds || 0).toFixed(6)
}

function escapeConcatPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/'/g, String.raw`'\\''`)
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

function buildFrameChunks(totalDurationSeconds, targetChunkDurationSeconds, frameRate) {
  const chunks = []
  const safeTotalDurationSeconds = Math.max(0, Number(totalDurationSeconds) || 0)
  const safeTargetChunkDurationSeconds = Math.max(0.5, Number(targetChunkDurationSeconds) || safeTotalDurationSeconds || 1)
  const safeFrameRate = Math.max(1, Number(frameRate) || 0)

  if (safeTotalDurationSeconds <= 0) {
    return chunks
  }

  const totalFrameCount = Math.max(1, Math.round(safeTotalDurationSeconds * safeFrameRate))
  const targetFrameCount = Math.max(1, Math.round(safeTargetChunkDurationSeconds * safeFrameRate))

  for (let startFrame = 0; startFrame < totalFrameCount;) {
    const frameCount = Math.min(targetFrameCount, totalFrameCount - startFrame)
    const start = startFrame / safeFrameRate
    const duration = frameCount / safeFrameRate

    if (duration > 0) {
      chunks.push({
        index: chunks.length,
        start,
        duration,
        startFrame,
        frameCount,
      })
    }

    startFrame += frameCount
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

function buildChunkArgs({ mergedPath, chunk, chunkOverlayAssets, workerPlan, framePreset, frameBackground, encoderPlan, outputPath, motionSegments, nativeFrameRate }) {
  const backgroundImagePath = getNativeBackgroundImagePath(frameBackground)
  const backgroundInputArgs = backgroundImagePath ? ['-loop', '1', '-i', backgroundImagePath] : []
  const overlayInputArgs = chunkOverlayAssets.flatMap((asset) => ['-loop', '1', '-i', asset.path])
  const filterPlan = buildFrameFilter(framePreset, frameBackground, chunkOverlayAssets, motionSegments, { frameRate: nativeFrameRate })

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
    ...backgroundInputArgs,
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
    '-r',
    String(nativeFrameRate),
    '-fps_mode',
    'cfr',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    outputPath,
  ]
}

async function concatFrameChunks({ sender, emitLog, emitProgress, jobDirectory, jobId, chunkPaths, outputPath }) {
  const manifestPath = path.join(jobDirectory, 'frame-chunks.txt')
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
  outputPath,
  exportQualityProfileId,
  keptScenes,
  framePreset,
  frameBackground,
  overlayAssets,
}) {
  const encoderPlan = await getNativeEncodePlan(exportQualityProfileId)
  const totalDurationSeconds = getTimelineDurationSeconds(keptScenes)
  const chunkPlan = getFrameChunkPlan({
    encoderPlan,
    sceneCount: keptScenes.length,
    totalDurationSeconds,
  })
  const sceneMotionSegments = buildFrameSceneMotionSegments(keptScenes)
  const nativeFrameRate = await readNativeVideoFrameRate(mergedPath)
  const chunks = buildFrameChunks(totalDurationSeconds, chunkPlan.targetChunkDurationSeconds, nativeFrameRate)
  if (chunks.length === 0) {
    throw new Error('No frame chunks were generated for native export.')
  }

  const effectiveWorkerCount = Math.max(1, Math.min(chunkPlan.workerCount, chunks.length))
  const workerPlan = getFrameWorkerPlan({
    workerCount: effectiveWorkerCount,
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
    detail: `Dựng khung ${framePreset.label} bằng ${encoderPlan.label} • ${chunks.length} chunk / ${effectiveWorkerCount} worker`,
  }, {
    encoder: encoderPlan,
    chunkPlan: {
      ...chunkPlan,
      effectiveWorkerCount,
    },
    frameWorkerPlan: workerPlan,
    frameRate: nativeFrameRate,
    frameAlignedChunks: true,
    overlayCount: overlayAssets.length,
    chunkCount: chunks.length,
  })

  await runWithConcurrency(chunks, effectiveWorkerCount, async (chunk) => {
    const chunkOverlayAssets = buildChunkOverlayAssets(overlayAssets, chunk)
    const chunkSceneMotionSegments = buildChunkSceneMotionSegments(sceneMotionSegments, chunk)
    const outputPath = buildChunkOutputPath(jobDirectory, chunk.index)
    chunkPaths[chunk.index] = outputPath

    emitLog(sender, jobId, 'framing', `Start frame chunk ${chunk.index + 1}/${chunks.length}`, 'info', {}, {
      chunkIndex: chunk.index,
      chunkStart: chunk.start,
      chunkDuration: chunk.duration,
      startFrame: chunk.startFrame,
      frameCount: chunk.frameCount,
      overlayCount: chunkOverlayAssets.length,
      motionCount: chunkSceneMotionSegments.length,
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
      motionSegments: chunkSceneMotionSegments,
      nativeFrameRate,
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

  const finalOutputPath = await concatFrameChunks({
    sender,
    emitLog,
    emitProgress,
    jobDirectory,
    jobId,
    chunkPaths,
    outputPath,
  })

  emitProgress(sender, jobId, {
    phase: 'framing',
    percent: 98,
    stagePercent: 100,
    detail: 'Đã dựng xong video khung native',
  })
  emitLog(sender, jobId, 'framing', 'Native chunked frame encode completed', 'info', {}, {
    chunkCount: chunks.length,
    outputPath: finalOutputPath,
  })

  return {
    outputPath: finalOutputPath,
    encoderPlan,
  }
}