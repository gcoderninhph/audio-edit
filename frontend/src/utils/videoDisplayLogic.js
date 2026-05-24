export function formatPlaybackTimestamp(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '00:00';
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function getPlaybackProgress(currentTime, duration) {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  const safeTime = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  return Math.min(100, (safeTime / duration) * 100);
}

export function resolvePointerSeekTime({ event, seekContainer, duration, mapTargetTime }) {
  if (!event || !seekContainer || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  const rect = seekContainer.getBoundingClientRect();
  if (!rect.width) {
    return null;
  }

  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const targetTime = ratio * duration;

  if (typeof mapTargetTime === 'function') {
    return mapTargetTime(targetTime);
  }

  return targetTime;
}

export async function toggleMediaPlayback(mediaElement, options = {}) {
  if (!mediaElement) {
    return;
  }

  const {
    onError,
    onPaused,
    onPlaying,
    onRestart,
    restartTime = 0,
    threshold = 0.05,
  } = options;

  if (!mediaElement.paused) {
    mediaElement.pause();
    onPaused?.();
    return;
  }

  const reachedEnd = mediaElement.ended
    || (Number.isFinite(mediaElement.duration)
      && mediaElement.duration > 0
      && mediaElement.currentTime >= mediaElement.duration - threshold);

  if (reachedEnd) {
    mediaElement.currentTime = restartTime;
    onRestart?.(restartTime);
  }

  try {
    await mediaElement.play();
    onPlaying?.();
  } catch (error) {
    onError?.(error);
  }
}

function getVoiceoverTrackKey(voiceoverTrack) {
  return voiceoverTrack?.storedFileName
    || voiceoverTrack?.fileName
    || voiceoverTrack?.previewUrl
    || '';
}

export function clampMediaVolume(value, fallback = 1) {
  const normalizedValue = Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(1, normalizedValue));
}

export function applyMediaVolume(mediaElement, volume, fallback = 1) {
  const nextVolume = clampMediaVolume(volume, fallback);
  if (mediaElement) {
    mediaElement.volume = nextVolume;
  }

  return nextVolume;
}

export function toggleMutedVolume(currentVolume, unmutedVolume = 1) {
  const safeCurrentVolume = clampMediaVolume(currentVolume, 0);
  return safeCurrentVolume > 0.001 ? 0 : clampMediaVolume(unmutedVolume, 1);
}

export function resolvePreviewAudioMix(audioMix = {}, voiceoverTrack = null) {
  const hasVoiceoverTrack = Boolean(voiceoverTrack?.previewUrl);
  const currentAudioTrackKey = getVoiceoverTrackKey(voiceoverTrack);
  const customizedAudioTrackKey = String(audioMix?.customizedAudioTrackKey || '');
  const hasCustomizedCurrentAudioMix = Boolean(currentAudioTrackKey) && customizedAudioTrackKey === currentAudioTrackKey;
  const videoVolume = clampMediaVolume(Number(audioMix?.videoVolume), 1);
  const voiceoverVolume = clampMediaVolume(Number(audioMix?.voiceoverVolume), 1);

  if (!hasVoiceoverTrack) {
    return {
      videoVolume,
      voiceoverVolume: 0,
    };
  }

  return {
    videoVolume: hasCustomizedCurrentAudioMix ? videoVolume : 0,
    voiceoverVolume: hasCustomizedCurrentAudioMix ? voiceoverVolume : 1,
  };
}
