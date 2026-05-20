function hasVoiceoverSource(voiceoverTrack) {
  return Boolean(
    voiceoverTrack && (
      voiceoverTrack.previewUrl
      || voiceoverTrack.source
      || voiceoverTrack.fileName
      || voiceoverTrack.storedFileName
    ),
  );
}

export function clampAudioMixVolume(value, fallback = 1) {
  const normalizedValue = Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(1, normalizedValue));
}

export function isAudioMixMuted(value) {
  return clampAudioMixVolume(value, 0) <= 0.001;
}

export function formatExportSeconds(seconds) {
  return Math.max(0, Number(seconds) || 0).toFixed(3);
}

export function formatAudioMixVolume(value) {
  return clampAudioMixVolume(value).toFixed(3).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function getExportTimelineDurationSeconds(keptScenes = []) {
  return keptScenes.reduce((sum, scene) => {
    const explicitDuration = Number(scene?.duration);
    const fallbackDuration = (Number(scene?.end) || 0) - (Number(scene?.start) || 0);
    return sum + Math.max(0, Number.isFinite(explicitDuration) ? explicitDuration : fallbackDuration);
  }, 0);
}

export function normalizeExportAudioMix(audioMix = {}, voiceoverTrack = null) {
  const hasVoiceoverTrack = hasVoiceoverSource(voiceoverTrack);

  return {
    hasVoiceoverTrack,
    videoVolume: clampAudioMixVolume(audioMix?.videoVolume, hasVoiceoverTrack ? 0 : 1),
    voiceoverVolume: hasVoiceoverTrack ? clampAudioMixVolume(audioMix?.voiceoverVolume, 1) : 0,
  };
}

export function getVoiceoverExportFileName(fileName = 'voiceover.mp3') {
  const matchedExtension = String(fileName || '').match(/\.[a-z0-9]+$/i);
  return `voiceover-input${matchedExtension?.[0] || '.mp3'}`;
}

export function buildVideoAudioFilter(timelineDurationSeconds, videoVolume) {
  return `volume=${formatAudioMixVolume(videoVolume)},atrim=0:${formatExportSeconds(timelineDurationSeconds)},asetpts=PTS-STARTPTS`;
}

export function buildVoiceoverAudioFilter(timelineDurationSeconds, voiceoverTrack, voiceoverVolume) {
  const delayMs = Math.max(0, Math.round((Number(voiceoverTrack?.startTime) || 0) * 1000));
  const delayFilter = delayMs > 0 ? `adelay=${delayMs}|${delayMs},` : '';
  return `${delayFilter}volume=${formatAudioMixVolume(voiceoverVolume)},atrim=0:${formatExportSeconds(timelineDurationSeconds)},asetpts=PTS-STARTPTS`;
}

export function buildVideoOnlyAudioArgs({ sourcePath = 'cut.mp4', timelineDurationSeconds, videoVolume, outputPath = 'mixed-audio.m4a' }) {
  return [
    '-i', sourcePath,
    '-vn',
    '-map', '0:a:0?',
    '-af', buildVideoAudioFilter(timelineDurationSeconds, videoVolume),
    '-c:a', 'aac',
    '-b:a', '192k',
    outputPath,
  ];
}

export function buildVoiceoverOnlyAudioArgs({ voiceoverPath, timelineDurationSeconds, voiceoverTrack, voiceoverVolume, outputPath = 'mixed-audio.m4a' }) {
  return [
    '-i', voiceoverPath,
    '-vn',
    '-map', '0:a:0',
    '-af', buildVoiceoverAudioFilter(timelineDurationSeconds, voiceoverTrack, voiceoverVolume),
    '-c:a', 'aac',
    '-b:a', '192k',
    outputPath,
  ];
}

export function buildMixedAudioArgs({ sourcePath = 'cut.mp4', voiceoverPath, timelineDurationSeconds, voiceoverTrack, videoVolume, voiceoverVolume, outputPath = 'mixed-audio.m4a' }) {
  return [
    '-i', sourcePath,
    '-i', voiceoverPath,
    '-vn',
    '-filter_complex',
    `[0:a]${buildVideoAudioFilter(timelineDurationSeconds, videoVolume)}[videoa];[1:a]${buildVoiceoverAudioFilter(timelineDurationSeconds, voiceoverTrack, voiceoverVolume)}[voicea];[videoa][voicea]amix=inputs=2:duration=first:dropout_transition=0[mixa]`,
    '-map', '[mixa]',
    '-c:a', 'aac',
    '-b:a', '192k',
    outputPath,
  ];
}

export function buildFinalMuxArgs({
  frameVideoPath,
  audioPath = '',
  timelineDurationSeconds,
  outputPath = 'output.mp4',
  copyVideo = false,
  copyAudio = true,
  optionalAudio = false,
  videoEncoding = null,
}) {
  const args = ['-hide_banner', '-y', '-i', frameVideoPath];

  if (audioPath) {
    args.push('-i', audioPath);
  }

  args.push('-map', '0:v:0');

  if (audioPath) {
    args.push('-map', optionalAudio ? '1:a?' : '1:a:0');
  }

  if (copyVideo) {
    args.push('-c:v', 'copy');
  } else {
    const resolvedVideoPreset = typeof videoEncoding?.preset === 'string' && videoEncoding.preset.trim()
      ? videoEncoding.preset.trim()
      : 'ultrafast';
    const resolvedVideoCrf = Number.isFinite(videoEncoding?.crf)
      ? String(videoEncoding.crf)
      : '23';

    args.push(
      '-c:v', 'libx264',
      '-threads', '1',
      '-preset', resolvedVideoPreset,
      '-crf', resolvedVideoCrf,
      '-pix_fmt', 'yuv420p',
    );
  }

  if (audioPath) {
    args.push('-c:a', copyAudio ? 'copy' : 'aac');
    if (!copyAudio) {
      args.push('-b:a', '192k');
    }
  } else {
    args.push('-an');
  }

  args.push(
    '-t', formatExportSeconds(timelineDurationSeconds),
    '-movflags', '+faststart',
    outputPath,
  );

  return args;
}

export function isMissingAudioStreamError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('matches no streams')
    || message.includes('does not contain any stream')
    || message.includes('stream specifier');
}