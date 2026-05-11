import path from 'node:path'
import {
  buildMixedAudioArgs,
  buildVideoOnlyAudioArgs,
  buildVoiceoverOnlyAudioArgs,
  isAudioMixMuted,
  isMissingAudioStreamError,
} from '../../src/utils/exportAudioMix.js'
import { runNativeFfmpeg } from './nativeFfmpeg.mjs'

export async function renderNativeExportAudioTrack({
  sender,
  jobId,
  emitLog,
  emitProgress,
  jobDirectory,
  mergedPath,
  voiceoverPath,
  voiceoverTrack,
  normalizedAudioMix,
  timelineDurationSeconds,
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
    emitProgress(sender, jobId, {
      phase: 'audio',
      percent: 98,
      stagePercent: 0,
      detail,
    })
    await runNativeFfmpeg(args, { cwd: jobDirectory })
  }

  if (wantsVideoAudio && wantsVoiceoverAudio) {
    try {
      await runAudioStage(buildMixedAudioArgs({
        sourcePath: mergedPath,
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
    await runAudioStage(buildVideoOnlyAudioArgs({
      sourcePath: mergedPath,
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