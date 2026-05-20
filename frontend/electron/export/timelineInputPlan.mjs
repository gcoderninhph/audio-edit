function formatSeconds(value) {
  return Math.max(0, Number(value) || 0).toFixed(6)
}

function normalizeDuration(scene) {
  const explicitDuration = Number(scene?.duration)
  const fallbackDuration = (Number(scene?.end) || 0) - (Number(scene?.start) || 0)
  return Math.max(0, Number.isFinite(explicitDuration) ? explicitDuration : fallbackDuration)
}

function buildTimelineScenes(keptScenes = []) {
  let outputCursor = 0

  return keptScenes
    .map((scene) => {
      const duration = normalizeDuration(scene)
      const outputStart = outputCursor
      const outputEnd = outputStart + duration
      outputCursor = outputEnd

      return {
        duration,
        outputEnd,
        outputStart,
        sourceStart: Math.max(0, Number(scene?.start) || 0),
      }
    })
    .filter((scene) => scene.duration > 0)
}

export function buildSceneSourceSlices(keptScenes = []) {
  return buildTimelineScenes(keptScenes).map((scene) => ({
    duration: scene.duration,
    sourceStart: scene.sourceStart,
  }))
}

export function buildChunkSourceSlices(keptScenes = [], chunk = {}) {
  const chunkStart = Math.max(0, Number(chunk.start) || 0)
  const chunkEnd = chunkStart + Math.max(0, Number(chunk.duration) || 0)

  if (chunkEnd <= chunkStart) {
    return []
  }

  return buildTimelineScenes(keptScenes)
    .map((scene) => {
      const overlapStart = Math.max(chunkStart, scene.outputStart)
      const overlapEnd = Math.min(chunkEnd, scene.outputEnd)
      const duration = overlapEnd - overlapStart

      if (duration <= 0) {
        return null
      }

      return {
        duration,
        sourceStart: scene.sourceStart + (overlapStart - scene.outputStart),
      }
    })
    .filter(Boolean)
}

export function buildSeekInputArgs(inputPath, slices = [], { threads = 0 } = {}) {
  const threadArgs = threads > 0 ? ['-threads', String(threads)] : []

  return slices.flatMap((slice) => [
    '-ss',
    formatSeconds(slice.sourceStart),
    '-t',
    formatSeconds(slice.duration),
    ...threadArgs,
    '-i',
    inputPath,
  ])
}

export function buildVideoTimelineSource(slices = [], outputLabel = 'timelinev') {
  if (slices.length <= 1) {
    return {
      filterComplex: '',
      sourceInputCount: slices.length,
      sourceVideoLabel: '0:v',
    }
  }

  const segmentFilters = slices.map((_, index) => `[${index}:v]setpts=PTS-STARTPTS[vseg${index}]`)
  const concatInputs = slices.map((_, index) => `[vseg${index}]`).join('')

  return {
    filterComplex: [
      ...segmentFilters,
      `${concatInputs}concat=n=${slices.length}:v=1:a=0[${outputLabel}]`,
    ].join(';'),
    sourceInputCount: slices.length,
    sourceVideoLabel: outputLabel,
  }
}

export function buildAudioTimelineSource(slices = [], outputLabel = 'timelinea') {
  if (slices.length <= 1) {
    return {
      filterComplex: '',
      sourceAudioLabel: '0:a',
      sourceInputCount: slices.length,
    }
  }

  const segmentFilters = slices.map((_, index) => `[${index}:a]asetpts=PTS-STARTPTS[aseg${index}]`)
  const concatInputs = slices.map((_, index) => `[aseg${index}]`).join('')

  return {
    filterComplex: [
      ...segmentFilters,
      `${concatInputs}concat=n=${slices.length}:v=0:a=1[${outputLabel}]`,
    ].join(';'),
    sourceAudioLabel: outputLabel,
    sourceInputCount: slices.length,
  }
}

export function buildAccurateAudioTimelineSource(keptScenes = [], inputIndex = 0, outputLabel = 'timelinea') {
  const scenes = buildTimelineScenes(keptScenes)
  if (scenes.length === 0) {
    return {
      filterComplex: '',
      sourceAudioLabel: `${inputIndex}:a`,
      sourceInputCount: 1,
    }
  }

  const segmentFilters = scenes.map((scene, index) => {
    const sourceEnd = scene.sourceStart + scene.duration
    return `[${inputIndex}:a]atrim=start=${formatSeconds(scene.sourceStart)}:end=${formatSeconds(sourceEnd)},asetpts=PTS-STARTPTS[aseg${index}]`
  })

  if (scenes.length === 1) {
    return {
      filterComplex: segmentFilters[0].replace('[aseg0]', `[${outputLabel}]`),
      sourceAudioLabel: outputLabel,
      sourceInputCount: 1,
    }
  }

  const concatInputs = scenes.map((_, index) => `[aseg${index}]`).join('')

  return {
    filterComplex: [
      ...segmentFilters,
      `${concatInputs}concat=n=${scenes.length}:v=0:a=1[${outputLabel}]`,
    ].join(';'),
    sourceAudioLabel: outputLabel,
    sourceInputCount: 1,
  }
}