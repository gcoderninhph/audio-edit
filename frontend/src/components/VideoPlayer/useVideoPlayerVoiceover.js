import { useCallback, useEffect, useRef } from 'react';

export default function useVideoPlayerVoiceover({ displayedTime, isPlaying, voiceoverTrack, voiceoverVolume = 1 }) {
  const voiceoverRef = useRef(null);
  const displayedTimeRef = useRef(0);
  const previousDisplayedTimeRef = useRef(0);

  const hasVoiceoverTrack = Boolean(voiceoverTrack?.previewUrl);

  const getVoiceoverTargetTime = useCallback((audioElement, targetDisplayedTime) => {
    const resolvedDuration = voiceoverTrack?.duration > 0
      ? voiceoverTrack.duration
      : (Number.isFinite(audioElement?.duration) ? audioElement.duration : 0);
    const unclampedTargetTime = Math.max(0, targetDisplayedTime - (voiceoverTrack?.startTime || 0));

    return {
      targetTime: resolvedDuration > 0 ? Math.min(unclampedTargetTime, resolvedDuration) : unclampedTargetTime,
      voiceoverDuration: resolvedDuration,
    };
  }, [voiceoverTrack]);

  const syncVoiceoverTime = useCallback((force = false, targetDisplayedTime = displayedTimeRef.current) => {
    const audioElement = voiceoverRef.current;
    if (!audioElement || !voiceoverTrack?.previewUrl) {
      return;
    }

    const { targetTime } = getVoiceoverTargetTime(audioElement, targetDisplayedTime);
    if (force || Math.abs((audioElement.currentTime || 0) - targetTime) > 0.25) {
      audioElement.currentTime = targetTime;
    }
  }, [getVoiceoverTargetTime, voiceoverTrack?.previewUrl]);

  useEffect(() => {
    displayedTimeRef.current = displayedTime;
  }, [displayedTime]);

  useEffect(() => {
    const audioElement = voiceoverRef.current;
    if (!voiceoverTrack?.previewUrl) {
      previousDisplayedTimeRef.current = displayedTime;
      return;
    }

    if (!audioElement) {
      previousDisplayedTimeRef.current = displayedTime;
      return;
    }

    const previousDisplayedTime = previousDisplayedTimeRef.current;
    previousDisplayedTimeRef.current = displayedTime;

    const hasLargeTimelineJump = Math.abs(displayedTime - previousDisplayedTime) > 0.75;
    const { targetTime, voiceoverDuration } = getVoiceoverTargetTime(audioElement, displayedTime);
    const hasReachedVoiceoverEnd = voiceoverDuration > 0 && targetTime >= voiceoverDuration - 0.05;

    if (hasReachedVoiceoverEnd) {
      audioElement.pause();
      if (Math.abs((audioElement.currentTime || 0) - voiceoverDuration) > 0.01) {
        audioElement.currentTime = voiceoverDuration;
      }
      return;
    }

    if (!isPlaying || hasLargeTimelineJump) {
      syncVoiceoverTime(true, displayedTime);
    }

    if (isPlaying && hasLargeTimelineJump) {
      const playPromise = audioElement.play();
      playPromise?.catch((error) => {
        console.error('Voiceover playback failed after seek:', error);
      });
    }
  }, [displayedTime, getVoiceoverTargetTime, isPlaying, syncVoiceoverTime, voiceoverTrack?.previewUrl]);

  useEffect(() => {
    const audioElement = voiceoverRef.current;
    if (!audioElement) {
      return;
    }

    if (!voiceoverTrack?.previewUrl) {
      audioElement.pause();
      audioElement.currentTime = 0;
      return;
    }

    audioElement.volume = Math.max(0, Math.min(1, voiceoverVolume));
    const currentDisplayedTime = displayedTimeRef.current;
    syncVoiceoverTime(true, currentDisplayedTime);

    const { targetTime, voiceoverDuration } = getVoiceoverTargetTime(audioElement, currentDisplayedTime);
    if (voiceoverDuration > 0 && targetTime >= voiceoverDuration - 0.05) {
      audioElement.pause();
      audioElement.currentTime = voiceoverDuration;
      return;
    }

    if (!isPlaying) {
      audioElement.pause();
      return;
    }

    const playPromise = audioElement.play();
    playPromise?.catch((error) => {
      console.error('Voiceover playback failed:', error);
    });
  }, [getVoiceoverTargetTime, isPlaying, syncVoiceoverTime, voiceoverTrack?.previewUrl, voiceoverVolume]);

  return {
    voiceoverRef,
    hasVoiceoverTrack,
  };
}