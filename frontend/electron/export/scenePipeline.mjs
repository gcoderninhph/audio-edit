import path from 'node:path'
import { getSceneWorkerPlan, runNativeFfmpeg } from './nativeFfmpeg.mjs'

function formatSeconds(seconds) {
  return Number(seconds || 0).toFixed(3)
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

function buildSegmentOutputPath(jobDirectory, index) {
  return path.join(jobDirectory, `segment-${String(index).padStart(3, '0')}.mp4`)
}

function buildSceneCutArgs(scene, inputPath, outputPath, threadsPerWorker) {
  return [
    '-hide_banner',
    '-y',
    '-ss',
    formatSeconds(scene.start),
    '-i',
    inputPath,
    '-t',
    formatSeconds(scene.duration),
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '22',
    '-threads',
    String(threadsPerWorker),
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    outputPath,
  ]
}

export async function extractSceneSegments({ sender, jobId, inputPath, jobDirectory, keptScenes, emitLog, emitProgress }) {
  const totalDurationSeconds = keptScenes.reduce((sum, scene) => sum + Math.max(0, Number(scene.duration) || 0), 0)
  const scenePlan = getSceneWorkerPlan({
    sceneCount: keptScenes.length,
    totalDurationSeconds,
  })
  const segmentPaths = new Array(keptScenes.length)
  let completedScenes = 0

  emitLog(
    sender,
    jobId,
    'cutting',
    `Start native scene extraction with ${scenePlan.workerCount} workers on ${scenePlan.logicalCpuCount} logical CPUs`,
    'info',
    {
      percent: 12,
      stagePercent: 0,
      detail: `Cắt ${keptScenes.length} cảnh bằng native FFmpeg`,
    },
    scenePlan,
  )

  await runWithConcurrency(keptScenes, scenePlan.workerCount, async (scene, index) => {
    const outputPath = buildSegmentOutputPath(jobDirectory, index)
    segmentPaths[index] = outputPath
    await runNativeFfmpeg(buildSceneCutArgs(scene, inputPath, outputPath, scenePlan.threadsPerWorker), {
      cwd: jobDirectory,
    })

    completedScenes += 1
    const stagePercent = Math.round((completedScenes / keptScenes.length) * 100)
    const percent = 12 + Math.round((completedScenes / keptScenes.length) * 43)
    emitProgress(sender, jobId, {
      phase: 'cutting',
      percent,
      stagePercent,
      detail: `Đã cắt ${completedScenes}/${keptScenes.length} cảnh bằng native FFmpeg`,
    })
    emitLog(sender, jobId, 'cutting', `Finished native segment ${index + 1}/${keptScenes.length}`, 'info', {}, {
      duration: scene.duration,
      outputPath,
    })
  })

  return segmentPaths
}

export async function mergeSceneSegments({ sender, jobId, jobDirectory, segmentPaths, emitLog, emitProgress }) {
  const manifestPath = path.join(jobDirectory, 'segments.txt')
  const mergedPath = path.join(jobDirectory, 'merged.mp4')
  const manifestContent = `${segmentPaths.map((segmentPath) => `file '${escapeConcatPath(segmentPath)}'`).join('\n')}\n`
  await import('node:fs/promises').then(({ writeFile }) => writeFile(manifestPath, manifestContent, 'utf8'))

  emitLog(sender, jobId, 'merging', 'Concat native scene segments', 'info', {
    percent: 58,
    stagePercent: 10,
    detail: `Ghép ${segmentPaths.length} cảnh đã cắt`,
  }, {
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
    mergedPath,
  ], { cwd: jobDirectory })

  emitProgress(sender, jobId, {
    phase: 'merging',
    percent: 68,
    stagePercent: 100,
    detail: 'Đã ghép xong track cảnh đã giữ',
  })
  emitLog(sender, jobId, 'merging', 'Merged native scene track', 'info', {}, { mergedPath })

  return mergedPath
}