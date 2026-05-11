import {
  buildMixedAudioArgs,
  buildVideoOnlyAudioArgs,
  buildVoiceoverOnlyAudioArgs,
  isAudioMixMuted,
  isMissingAudioStreamError,
} from './exportAudioMix';

export async function materializeVoiceoverFile(voiceoverTrack) {
  if (!voiceoverTrack?.previewUrl) {
    return null;
  }

  const response = await fetch(voiceoverTrack.previewUrl);
  if (!response.ok) {
    throw new Error('Khong the doc audio thuyet minh de export.');
  }

  const voiceoverBlob = await response.blob();
  return new File([voiceoverBlob], voiceoverTrack.fileName || 'voiceover.mp3', {
    type: voiceoverTrack.mimeType || voiceoverBlob.type || 'audio/mpeg',
  });
}

export async function renderExportAudioTrack({
  normalizedAudioMix,
  timelineDurationSeconds,
  voiceoverInputPath,
  voiceoverTrack,
  runStage,
  emitLog,
  cleanupFiles,
}) {
  const outputPath = 'mixed-audio.m4a';
  const wantsVideoAudio = !isAudioMixMuted(normalizedAudioMix.videoVolume);
  const wantsVoiceoverAudio = Boolean(voiceoverInputPath) && !isAudioMixMuted(normalizedAudioMix.voiceoverVolume);

  if (!wantsVideoAudio && !wantsVoiceoverAudio) {
    emitLog('audio', 'Export audio was muted; continue with silent output', 'warning');
    return null;
  }

  await cleanupFiles([outputPath]);

  if (wantsVideoAudio && wantsVoiceoverAudio) {
    try {
      await runStage(buildMixedAudioArgs({
        sourcePath: 'cut.mp4',
        voiceoverPath: voiceoverInputPath,
        timelineDurationSeconds,
        voiceoverTrack,
        videoVolume: normalizedAudioMix.videoVolume,
        voiceoverVolume: normalizedAudioMix.voiceoverVolume,
        outputPath,
      }), {
        phase: 'audio',
        startPercent: 82,
        endPercent: 88,
      });
      return outputPath;
    } catch (error) {
      if (!isMissingAudioStreamError(error)) {
        throw error;
      }

      emitLog('audio', 'Source video has no audio stream; export voiceover only', 'warning');
    }
  }

  if (wantsVoiceoverAudio) {
    await runStage(buildVoiceoverOnlyAudioArgs({
      voiceoverPath: voiceoverInputPath,
      timelineDurationSeconds,
      voiceoverTrack,
      voiceoverVolume: normalizedAudioMix.voiceoverVolume,
      outputPath,
    }), {
      phase: 'audio',
      startPercent: 82,
      endPercent: 88,
    });
    return outputPath;
  }

  try {
    await runStage(buildVideoOnlyAudioArgs({
      sourcePath: 'cut.mp4',
      timelineDurationSeconds,
      videoVolume: normalizedAudioMix.videoVolume,
      outputPath,
    }), {
      phase: 'audio',
      startPercent: 82,
      endPercent: 88,
    });
    return outputPath;
  } catch (error) {
    if (!isMissingAudioStreamError(error)) {
      throw error;
    }

    emitLog('audio', 'Source video has no audio stream; continue without audio', 'warning');
    return null;
  }
}