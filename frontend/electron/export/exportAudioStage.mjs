import path from 'node:path'
import {
  buildVideoAudioFilter,
  buildVoiceoverAudioFilter,
  buildVoiceoverOnlyAudioArgs,
  isAudioMixMuted,
  isMissingAudioStreamError,
} from '../../src/utils/exportAudioMix.js'
import { runNativeFfmpeg } from './nativeFfmpeg.mjs'
import { buildAccurateAudioTimelineSource } from './timelineInputPlan.mjs'

function buildTimelineVideoAudioFilter({ keptScenes, timelineDurationSeconds, videoVolume }) {
  if (!Array.isArray(keptScenes) || keptScenes.length === 0) {
    throw new Error('No source audio slices were generated for native export.')
  }

  const timelineSource = buildAccurateAudioTimelineSource(keptScenes)
  const filterComplex = [
    timelineSource.filterComplex,
    `[${timelineSource.sourceAudioLabel}]${buildVideoAudioFilter(timelineDurationSeconds, videoVolume)}[videoa]`,
  ].filter(Boolean).join(';')

  return {
    filterComplex,
    sourceInputCount: timelineSource.sourceInputCount,
  }
}

function buildTimelineVideoOnlyAudioArgs({ sourcePath, keptScenes, timelineDurationSeconds, videoVolume, outputPath }) {
  const timelineAudio = buildTimelineVideoAudioFilter({ keptScenes, timelineDurationSeconds, videoVolume })

  return [
    '-hide_banner',
    '-y',
    '-i',
    sourcePath,
    '-vn',
    '-filter_complex',
    timelineAudio.filterComplex,
    '-map',
    '[videoa]',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    outputPath,
  ]
}

function buildTimelineMixedAudioArgs({ sourcePath, keptScenes, voiceoverPath, timelineDurationSeconds, voiceoverTrack, videoVolume, voiceoverVolume, outputPath }) {
  const timelineAudio = buildTimelineVideoAudioFilter({ keptScenes, timelineDurationSeconds, videoVolume })
  const voiceoverInputIndex = timelineAudio.sourceInputCount
  const filterComplex = [
    timelineAudio.filterComplex,
    `[${voiceoverInputIndex}:a]${buildVoiceoverAudioFilter(timelineDurationSeconds, voiceoverTrack, voiceoverVolume)}[voicea]`,
    '[videoa][voicea]amix=inputs=2:duration=first:dropout_transition=0[mixa]',
  ].join(';')

  return [
    '-hide_banner',
    '-y',
    '-i',
    sourcePath,
    '-i',
    voiceoverPath,
    '-vn',
    '-filter_complex',
    filterComplex,
    '-map',
    '[mixa]',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    outputPath,
  ]
}

export async function renderNativeExportAudioTrack({
  sender,
  jobId,
  emitLog,
  emitProgress,
  jobDirectory,
  inputPath,
  keptScenes,
  voiceoverPath,
  voiceoverTrack,
  normalizedAudioMix,
  timelineDurationSeconds,
  emitProgressUpdates = true,
}) {
  const outputPath = path.join(jobDirectory, 'mixed-audio.m4a')
  const wantsVideoAudio = !isAudioMixMuted(normalizedAudioMix.videoVolume)
  const wantsVoiceoverAudio = Boolean(voiceoverPath) && !isAudioMixMuted(normalizedAudioMix.voiceoverVolume)

  if (!wantsVideoAudio && !wantsVoiceoverAudio) {
    emitLog(sender, jobId, 'audio', 'Export audio was muted; continue with silent output', 'warning', {
      percent: 98,
      stagePercent: 100,
      detail: 'Export giu video khong co audio',
    })
    return null
  }

  const runAudioStage = async (args, detail) => {
    emitLog(sender, jobId, 'audio', detail, 'info', {
      percent: emitProgressUpdates ? 98 : 82,
      stagePercent: 0,
      detail,
    })
    if (emitProgressUpdates) {
      emitProgress(sender, jobId, {
        phase: 'audio',
        percent: 98,
        stagePercent: 0,
        detail,
      })
    }
    await runNativeFfmpeg(args, { cwd: jobDirectory })
  }

  if (wantsVideoAudio && wantsVoiceoverAudio) {
    try {
      await runAudioStage(buildTimelineMixedAudioArgs({
        sourcePath: inputPath,
        keptScenes,
        voiceoverPath,
        timelineDurationSeconds,
        voiceoverTrack,
        videoVolume: normalizedAudioMix.videoVolume,
        voiceoverVolume: normalizedAudioMix.voiceoverVolume,
        outputPath,
      }), 'Dang tron audio video va thuyet minh')
      return outputPath
    } catch (error) {
      if (!isMissingAudioStreamError(error)) {
        throw error
      }

      emitLog(sender, jobId, 'audio', 'Source video has no audio stream; export voiceover only', 'warning', {
        percent: 98,
        stagePercent: 35,
        detail: 'Video goc khong co audio, chi giu thuyet minh',
      })
    }
  }

  if (wantsVoiceoverAudio) {
    await runAudioStage(buildVoiceoverOnlyAudioArgs({
      voiceoverPath,
      timelineDurationSeconds,
      voiceoverTrack,
      voiceoverVolume: normalizedAudioMix.voiceoverVolume,
      outputPath,
    }), 'Dang dung track thuyet minh cho export')
    return outputPath
  }

  try {
    await runAudioStage(buildTimelineVideoOnlyAudioArgs({
      sourcePath: inputPath,
      keptScenes,
      timelineDurationSeconds,
      videoVolume: normalizedAudioMix.videoVolume,
      outputPath,
    }), 'Dang can bang lai audio video goc')
    return outputPath
  } catch (error) {
    if (!isMissingAudioStreamError(error)) {
      throw error
    }

    emitLog(sender, jobId, 'audio', 'Source video has no audio stream; continue without audio', 'warning', {
      percent: 98,
      stagePercent: 100,
      detail: 'Video goc khong co audio de tron',
    })
    return null
  }
}