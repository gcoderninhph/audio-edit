export function buildSceneAlignedFrameChunks(keptScenes = [], frameRate) {
  const chunks = []
  const safeFrameRate = Math.max(1, Number(frameRate) || 0)
  let outputCursor = 0

  for (const scene of keptScenes) {
    const duration = Math.max(0, Number(scene?.duration) || (Number(scene?.end) || 0) - (Number(scene?.start) || 0))
    if (duration <= 0) {
      continue
    }

    chunks.push({
      index: chunks.length,
      start: outputCursor,
      duration,
      startFrame: Math.round(outputCursor * safeFrameRate),
      frameCount: Math.max(1, Math.round(duration * safeFrameRate)),
    })
    outputCursor += duration
  }

  return chunks
}

export function buildSceneSplitFrameChunks(keptScenes = [], frameRate, maxChunkDurationSeconds = 6) {
  const chunks = []
  const safeFrameRate = Math.max(1, Number(frameRate) || 0)
  const safeMaxDuration = Math.max(1, Number(maxChunkDurationSeconds) || 6)
  let outputCursor = 0

  for (const scene of keptScenes) {
    const sceneDuration = Math.max(0, Number(scene?.duration) || (Number(scene?.end) || 0) - (Number(scene?.start) || 0))
    if (sceneDuration <= 0) {
      continue
    }

    let sceneOffset = 0
    while (sceneOffset < sceneDuration - 0.000001) {
      const remainingDuration = sceneDuration - sceneOffset
      const duration = remainingDuration > safeMaxDuration ? safeMaxDuration : remainingDuration
      const start = outputCursor + sceneOffset

      chunks.push({
        index: chunks.length,
        start,
        duration,
        startFrame: Math.round(start * safeFrameRate),
        frameCount: Math.max(1, Math.round(duration * safeFrameRate)),
      })
      sceneOffset += duration
    }

    outputCursor += sceneDuration
  }

  return chunks
}

function formatSeconds(value) {
  return Math.max(0, Number(value) || 0).toFixed(6)
}

export function buildFastFeatureInputArgs(inputPath, slices = []) {
  const usableSlices = slices.filter((slice) => Math.max(0, Number(slice?.duration) || 0) > 0.001)
  if (usableSlices.length !== 1) {
    throw new Error('Fast feature frame export requires scene-aligned chunks with exactly one source slice.')
  }

  const [slice] = usableSlices
  return [
    '-ss',
    formatSeconds(slice.sourceStart),
    '-t',
    formatSeconds(slice.duration),
    '-i',
    inputPath,
  ]
}

export function buildFastFeatureEncoderOutputArgs(encoderPlan) {
  if (encoderPlan.codec !== 'h264_nvenc') {
    return encoderPlan.outputArgs
  }

  const outputArgs = [...encoderPlan.outputArgs]
  const cqIndex = outputArgs.indexOf('-cq')
  if (cqIndex >= 0 && cqIndex + 1 < outputArgs.length) {
    outputArgs[cqIndex + 1] = String(Math.max(Number(outputArgs[cqIndex + 1]) || 0, 24))
  }
  const presetIndex = outputArgs.indexOf('-preset')
  if (presetIndex >= 0 && presetIndex + 1 < outputArgs.length) {
    outputArgs[presetIndex + 1] = 'p1'
    return outputArgs
  }

  return [...outputArgs, '-preset', 'p1']
}