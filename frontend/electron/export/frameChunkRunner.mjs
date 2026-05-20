import path from 'node:path'
import { buildFastFeatureEncoderOutputArgs, buildFastFeatureInputArgs } from './frameCudaTurboPath.mjs'
import { buildFastFeatureFrameFilter, buildFrameFilter, getNativeBackgroundImagePath } from './frameFilterGraph.mjs'
import { buildChunkSceneMotionSegments } from './frameMotionFilter.mjs'
import { getFrameWorkerPlan, runNativeFfmpeg } from './nativeFfmpeg.mjs'
import { buildChunkSourceSlices, buildSeekInputArgs, buildVideoTimelineSource } from './timelineInputPlan.mjs'

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

export function getTimelineDurationSeconds(keptScenes) {
  return keptScenes.reduce((sum, scene) => sum + Math.max(0, Number(scene.duration) || 0), 0)
}

export function buildFrameChunks(totalDurationSeconds, targetChunkDurationSeconds, frameRate) {
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
      chunks.push({ index: chunks.length, start, duration, startFrame, frameCount })
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

      return { path: asset.path, x: asset.x, y: asset.y, events }
    })
    .filter(Boolean)
}

function createFramingProgressEmitter(context) {
  const progressState = {
    lastEmitAt: 0,
    lastStagePercent: -1,
    lastPercent: -1,
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

function buildChunkArgs({ inputPath, chunk, timelineSlices, chunkOverlayAssets, workerPlan, framePreset, frameBackground, encoderPlan, outputPath, motionSegments, nativeFrameRate, hideWatermark, useFastFeatureFramePath }) {
  if (!Array.isArray(timelineSlices) || timelineSlices.length === 0) {
    throw new Error(`No source slices were generated for frame chunk ${chunk.index + 1}.`)
  }

  if (useFastFeatureFramePath) {
    const sourceInputArgs = buildFastFeatureInputArgs(inputPath, timelineSlices)
    const filterPlan = buildFastFeatureFrameFilter(framePreset, frameBackground, chunkOverlayAssets, motionSegments, {
      frameRate: nativeFrameRate,
      timeOffset: chunk.start,
      duration: chunk.duration,
      hideWatermark,
      mediaInputOffset: 1,
    })
    const overlayInputArgs = chunkOverlayAssets.flatMap((asset) => ['-loop', '1', '-i', asset.path])

    return [
      '-hide_banner',
      '-y',
      ...sourceInputArgs,
      ...overlayInputArgs,
      '-filter_complex',
      filterPlan.filterComplex,
      '-map',
      filterPlan.outputLabel,
      '-c:v',
      encoderPlan.codec,
      ...buildFastFeatureEncoderOutputArgs(encoderPlan),
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(nativeFrameRate),
      '-fps_mode',
      'cfr',
      '-an',
      outputPath,
    ]
  }

  const sourceInputArgs = buildSeekInputArgs(inputPath, timelineSlices, { threads: workerPlan.decodeThreads })
  const timelineSource = buildVideoTimelineSource(timelineSlices)
  const backgroundImagePath = getNativeBackgroundImagePath(frameBackground)
  const backgroundInputArgs = backgroundImagePath ? ['-loop', '1', '-i', backgroundImagePath] : []
  const overlayInputArgs = chunkOverlayAssets.flatMap((asset) => ['-loop', '1', '-i', asset.path])
  const filterPlan = buildFrameFilter(framePreset, frameBackground, chunkOverlayAssets, motionSegments, {
    frameRate: nativeFrameRate,
    timeOffset: chunk.start,
    duration: chunk.duration,
    hideWatermark,
    mediaInputOffset: timelineSource.sourceInputCount,
    sourceVideoLabel: timelineSource.sourceVideoLabel,
  })
  const filterComplex = [timelineSource.filterComplex, filterPlan.filterComplex].filter(Boolean).join(';')

  return [
    '-hide_banner',
    '-y',
    '-progress',
    'pipe:1',
    '-nostats',
    ...sourceInputArgs,
    ...backgroundInputArgs,
    ...overlayInputArgs,
    '-filter_threads',
    String(workerPlan.filterThreads),
    '-filter_complex_threads',
    String(workerPlan.filterComplexThreads),
    '-filter_complex',
    filterComplex,
    '-map',
    filterPlan.outputLabel,
    '-c:v',
    encoderPlan.codec,
    ...encoderPlan.outputArgs,
    '-threads',
    String(workerPlan.encodeThreads),
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(nativeFrameRate),
    '-fps_mode',
    'cfr',
    '-an',
    outputPath,
  ]
}

async function runChunks({
  sender,
  emitLog,
  emitProgress,
  jobId,
  jobDirectory,
  inputPath,
  keptScenes,
  overlayAssets,
  sceneMotionSegments,
  framePreset,
  frameBackground,
  encoderPlan,
  hideWatermark,
  nativeFrameRate,
  chunks,
  workerConcurrency,
  workerPlan,
  chunkPaths,
  useFastFeatureFramePath,
}) {
  const chunkProgressMicroseconds = chunks.map(() => 0)
  const latestSpeedByChunk = chunks.map(() => '')
  const emitAggregateProgress = createFramingProgressEmitter({
    sender,
    emitProgress,
    jobId,
    chunks,
    chunkProgressMicroseconds,
    latestSpeedByChunk,
  })

  emitAggregateProgress({ force: true })

  await runWithConcurrency(chunks, workerConcurrency, async (chunk) => {
    const timelineSlices = buildChunkSourceSlices(keptScenes, chunk)
    const chunkOverlayAssets = buildChunkOverlayAssets(overlayAssets, chunk)
    const chunkSceneMotionSegments = buildChunkSceneMotionSegments(sceneMotionSegments, chunk)
    const outputPath = buildChunkOutputPath(jobDirectory, chunk.index)
    const chunkStartedAt = Date.now()
    chunkPaths[chunk.index] = outputPath

    emitLog(sender, jobId, 'framing', `Start frame chunk ${chunk.index + 1}/${chunks.length}`, 'info', {}, {
      chunkIndex: chunk.index,
      chunkStart: chunk.start,
      chunkDuration: chunk.duration,
      startFrame: chunk.startFrame,
      frameCount: chunk.frameCount,
      sourceSliceCount: timelineSlices.length,
      overlayCount: chunkOverlayAssets.length,
      motionCount: chunkSceneMotionSegments.length,
      workerConcurrency,
      fastFeatureFramePath: useFastFeatureFramePath,
    })

    await runNativeFfmpeg(buildChunkArgs({
      inputPath,
      chunk,
      timelineSlices,
      chunkOverlayAssets,
      workerPlan,
      framePreset,
      frameBackground,
      encoderPlan,
      outputPath,
      hideWatermark,
      motionSegments: chunkSceneMotionSegments,
      nativeFrameRate,
      useFastFeatureFramePath,
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
    emitLog(sender, jobId, 'framing', `Finished frame chunk ${chunk.index + 1}/${chunks.length}`, 'info', {}, { chunkIndex: chunk.index, elapsedMs: Date.now() - chunkStartedAt, outputPath, workerConcurrency })
    emitAggregateProgress({ force: true })
  })
}

export async function runFrameChunksWithRetry({
  sender,
  emitLog,
  emitProgress,
  jobId,
  jobDirectory,
  inputPath,
  keptScenes,
  overlayAssets,
  sceneMotionSegments,
  framePreset,
  frameBackground,
  encoderPlan,
  hideWatermark,
  nativeFrameRate,
  chunks,
  initialWorkerCount,
  initialWorkerPlan,
  useFastFeatureFramePath = false,
}) {
  const chunkPaths = new Array(chunks.length)

  const retryWorkerCounts = encoderPlan.hardware && initialWorkerCount > 1
    ? [initialWorkerCount, Math.max(1, Math.floor(initialWorkerCount / 2)), 1].filter((count, index, list) => list.indexOf(count) === index)
    : [initialWorkerCount]
  let lastError = null

  for (let attemptIndex = 0; attemptIndex < retryWorkerCounts.length; attemptIndex += 1) {
    const workerConcurrency = retryWorkerCounts[attemptIndex]
    const workerPlan = attemptIndex === 0
      ? initialWorkerPlan
      : getFrameWorkerPlan({ workerCount: workerConcurrency, encoderPlan })

    if (attemptIndex > 0) {
      emitLog(sender, jobId, 'framing', 'Retry native frame encode with fewer hardware workers after multi-session failure', 'warning', {
        percent: 70,
        stagePercent: 0,
        detail: `GPU encode da that bai, thu lai voi ${workerConcurrency} worker`,
      }, {
        initialWorkerCount,
        retryWorkerCount: workerConcurrency,
        error: lastError?.message || null,
      })
    }

    try {
      await runChunks({
        sender,
        emitLog,
        emitProgress,
        jobId,
        jobDirectory,
        inputPath,
        keptScenes,
        overlayAssets,
        sceneMotionSegments,
        framePreset,
        frameBackground,
        encoderPlan,
        hideWatermark,
        nativeFrameRate,
        chunks,
        workerConcurrency,
        workerPlan,
        chunkPaths,
        useFastFeatureFramePath,
      })
      return chunkPaths
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}