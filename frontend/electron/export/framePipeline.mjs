import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildSceneSplitFrameChunks } from './frameCudaTurboPath.mjs'
import { buildFrameSceneMotionSegments } from './frameMotionFilter.mjs'
import { buildFrameChunks, getTimelineDurationSeconds, runFrameChunksWithRetry } from './frameChunkRunner.mjs'
import { getFrameChunkPlan, getFrameWorkerPlan, getNativeEncodePlan, readNativeVideoFrameRate, runNativeFfmpeg } from './nativeFfmpeg.mjs'

function escapeConcatPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/'/g, String.raw`'\\''`)
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

function isNativeImageBackground(frameBackground) {
  return Boolean(frameBackground && typeof frameBackground === 'object' && frameBackground.kind === 'image')
}

function shouldUseFastFeatureFramePath({ encoderPlan, frameBackground }) {
  return Boolean(
    encoderPlan?.hardware
      && encoderPlan.codec === 'h264_nvenc'
      && !isNativeImageBackground(frameBackground),
  )
}

function getFastFeatureWorkerCount(logicalCpuCount, chunkCount) {
  const targetWorkerCount = Math.min(10, Math.max(8, Math.ceil((Number(logicalCpuCount) || 1) / 3)))
  return Math.max(1, Math.min(chunkCount, targetWorkerCount))
}

export async function frameSourceTimelineVideo({
  sender,
  emitLog,
  emitProgress,
  jobId,
  jobDirectory,
  inputPath,
  outputPath,
  exportQualityProfileId,
  encoderPlan: providedEncoderPlan = null,
  keptScenes,
  framePreset,
  frameBackground,
  hideWatermark = false,
  overlayAssets,
}) {
  const encoderPlan = providedEncoderPlan || await getNativeEncodePlan(exportQualityProfileId)
  const totalDurationSeconds = getTimelineDurationSeconds(keptScenes)
  const chunkPlan = getFrameChunkPlan({
    encoderPlan,
    sceneCount: keptScenes.length,
    totalDurationSeconds,
  })
  const sceneMotionSegments = buildFrameSceneMotionSegments(keptScenes)
  const nativeFrameRate = await readNativeVideoFrameRate(inputPath)
  const useFastFeatureFramePath = shouldUseFastFeatureFramePath({ encoderPlan, frameBackground })
  const chunks = useFastFeatureFramePath
    ? buildSceneSplitFrameChunks(keptScenes, nativeFrameRate, 7)
    : buildFrameChunks(totalDurationSeconds, chunkPlan.targetChunkDurationSeconds, nativeFrameRate)
  if (chunks.length === 0) {
    throw new Error('No frame chunks were generated for native export.')
  }

  const effectiveWorkerCount = useFastFeatureFramePath
    ? getFastFeatureWorkerCount(chunkPlan.logicalCpuCount, chunks.length)
    : Math.max(1, Math.min(chunkPlan.workerCount, chunks.length))
  const workerPlan = getFrameWorkerPlan({
    workerCount: effectiveWorkerCount,
    encoderPlan,
  })

  emitLog(sender, jobId, 'framing', `Start direct native timeline frame encode with ${encoderPlan.label}`, 'info', {
    percent: 70,
    stagePercent: 0,
    detail: `Dựng khung trực tiếp từ video gốc bằng ${encoderPlan.label} • ${chunks.length} chunk / ${effectiveWorkerCount} worker`,
  }, {
    encoder: encoderPlan,
    chunkPlan: {
      ...chunkPlan,
      effectiveWorkerCount,
    },
    frameWorkerPlan: workerPlan,
    frameRate: nativeFrameRate,
    frameAlignedChunks: true,
    fastFeatureFramePath: useFastFeatureFramePath,
    fastFeatureMotionCount: sceneMotionSegments.length,
    fastFeatureBackground: useFastFeatureFramePath && typeof frameBackground === 'object' ? frameBackground.kind || 'custom' : null,
    overlayCount: overlayAssets.length,
    chunkCount: chunks.length,
  })

  const chunkPaths = await runFrameChunksWithRetry({
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
    initialWorkerCount: effectiveWorkerCount,
    initialWorkerPlan: workerPlan,
    useFastFeatureFramePath,
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