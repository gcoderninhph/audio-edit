import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  createImageFrameBackgroundFromFile,
  getFrameBackgroundLabel,
  getFrameBackgroundFillColor,
  getFramePresetById,
} from '../../utils/frameComposer';
import { drawFrameComposition, loadFrameBackgroundImage } from '../../utils/frameCanvasRenderer';
import { getKeptScenes, getKeptDuration, mapRealToKeptTime, mapKeptToRealTime } from '../../utils/timeMapping';
import VideoPlayerFrameControls from './VideoPlayerFrameControls';
import VideoPlayerFrameSummaryBar from './VideoPlayerFrameSummaryBar';
import VideoPlayerSidebar from './VideoPlayerSidebar';
import VideoPlayerTransportControls from './VideoPlayerTransportControls';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import './VideoPlayer.css';

const FRAME_SIDEBAR_SECTIONS = Object.freeze({
  FRAME: 'frame',
  BACKGROUND: 'background',
  AUDIO: 'audio',
});

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function VideoPlayer({
  videoUrl,
  videoRef,
  onTimeUpdate,
  onDurationChange,
  framePresetId,
  onFramePresetChange,
  frameBackground,
  onFrameBackgroundChange,
  currentScene,
  scenes,
  deletedSceneIds,
  subtitles,
  voiceoverTrack,
  activeSidebarSection,
  onToggleSidebarSection,
  onCloseSidebarSection,
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [realCurrentTime, setRealCurrentTime] = useState(0);
  const [videoVolume, setVideoVolume] = useState(1);
  const [voiceoverVolume, setVoiceoverVolume] = useState(1);
  const [customizedAudioTrackKey, setCustomizedAudioTrackKey] = useState('');
  const [frameBackgroundImage, setFrameBackgroundImage] = useState(null);
  const seekBarRef = useRef(null);
  const canvasRef = useRef(null);
  const voiceoverRef = useRef(null);
  const animationFrameRef = useRef(null);
  const framePreset = useMemo(() => getFramePresetById(framePresetId), [framePresetId]);

  const keptScenes = useMemo(() => getKeptScenes(scenes, deletedSceneIds), [scenes, deletedSceneIds]);
  const keptDuration = useMemo(() => getKeptDuration(keptScenes), [keptScenes]);
  const hasSceneCuts = keptScenes.length > 0;
  const displayedTime = useMemo(() => {
    if (!hasSceneCuts) return realCurrentTime;
    return mapRealToKeptTime(realCurrentTime, keptScenes);
  }, [hasSceneCuts, realCurrentTime, keptScenes]);
  const displayedDuration = useMemo(() => {
    if (!hasSceneCuts) return duration;
    return keptDuration;
  }, [duration, hasSceneCuts, keptDuration]);
  const frameBackgroundLabel = useMemo(() => getFrameBackgroundLabel(frameBackground), [frameBackground]);
  const hasVoiceoverTrack = Boolean(voiceoverTrack?.previewUrl);
  const currentAudioTrackKey = voiceoverTrack?.previewUrl || '';
  const hasCustomizedCurrentAudioMix = Boolean(currentAudioTrackKey) && customizedAudioTrackKey === currentAudioTrackKey;
  const effectiveVideoVolume = hasVoiceoverTrack
    ? (hasCustomizedCurrentAudioMix ? videoVolume : 0)
    : videoVolume;
  const effectiveVoiceoverVolume = hasVoiceoverTrack
    ? (hasCustomizedCurrentAudioMix ? voiceoverVolume : 1)
    : 1;
  const sidebarTitle = useMemo(() => {
    if (activeSidebarSection === FRAME_SIDEBAR_SECTIONS.FRAME) {
      return 'Chỉnh khung video';
    }

    if (activeSidebarSection === FRAME_SIDEBAR_SECTIONS.BACKGROUND) {
      return 'Chỉnh nền video';
    }

    if (activeSidebarSection === FRAME_SIDEBAR_SECTIONS.AUDIO) {
      return 'Chỉnh âm thanh xem trước';
    }

    return 'Chỉnh video';
  }, [activeSidebarSection]);

  const syncVoiceoverTime = useCallback((force = false) => {
    const audioElement = voiceoverRef.current;
    if (!audioElement || !voiceoverTrack?.previewUrl) return;

    const maxTime = voiceoverTrack.duration > 0
      ? voiceoverTrack.duration
      : (Number.isFinite(audioElement.duration) ? audioElement.duration : displayedDuration);
    const targetTime = Math.max(0, Math.min(displayedTime - (voiceoverTrack.startTime || 0), maxTime));

    if (force || Math.abs((audioElement.currentTime || 0) - targetTime) > 0.25) {
      audioElement.currentTime = targetTime;
    }
  }, [displayedDuration, displayedTime, voiceoverTrack]);

  const syncPlaybackState = useCallback(() => {
    const mediaElement = videoRef.current;
    if (!mediaElement) {
      setIsPlaying(false);
      return;
    }
    setIsPlaying(!mediaElement.paused && !mediaElement.ended);
  }, [videoRef]);

  const handleLoadedMetadata = useCallback(() => {
    const mediaElement = videoRef.current;
    const nextDuration = mediaElement?.duration || 0;
    setDuration(nextDuration);
    onDurationChange?.(nextDuration);

    if (mediaElement && nextDuration > 0 && mediaElement.currentTime >= nextDuration) {
      const restartTime = keptScenes[0]?.start ?? 0;
      mediaElement.currentTime = restartTime;
      setRealCurrentTime(restartTime);
      onTimeUpdate?.(restartTime);
    }

    syncPlaybackState();
  }, [keptScenes, onDurationChange, onTimeUpdate, syncPlaybackState, videoRef]);

  const handleTimeUpdate = () => {
    let time = videoRef.current?.currentTime || 0;

    if (scenes && deletedSceneIds && videoRef.current && !videoRef.current.paused) {
      const activeScene = scenes.find((scene) => time >= scene.start && time < scene.end);
      if (activeScene && deletedSceneIds.has(activeScene.id)) {
        const nextKeptScene = scenes.find((scene) => scene.start >= activeScene.end && !deletedSceneIds.has(scene.id));
        if (nextKeptScene) {
          videoRef.current.currentTime = nextKeptScene.start + 0.05;
          time = nextKeptScene.start + 0.05;
        } else {
          videoRef.current.pause();
          setIsPlaying(false);
          videoRef.current.currentTime = duration;
          time = duration;
        }
      }
    }

    setRealCurrentTime(time);
    onTimeUpdate?.(time);
  };

  const handlePlayPause = useCallback(() => {
    const mediaElement = videoRef.current;
    if (!mediaElement) return;

    if (!mediaElement.paused) {
      mediaElement.pause();
      return;
    }

    const reachedEnd = mediaElement.ended
      || (Number.isFinite(mediaElement.duration)
        && mediaElement.duration > 0
        && mediaElement.currentTime >= mediaElement.duration - 0.05);

    if (reachedEnd) {
      const restartTime = keptScenes[0]?.start ?? 0;
      mediaElement.currentTime = restartTime;
      setRealCurrentTime(restartTime);
      onTimeUpdate?.(restartTime);
    }

    const playPromise = mediaElement.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          syncPlaybackState();
        })
        .catch((error) => {
          console.error('Video playback failed:', error);
          setIsPlaying(false);
        });
      return;
    }

    syncPlaybackState();
  }, [keptScenes, onTimeUpdate, syncPlaybackState, videoRef]);

  const handleSeek = useCallback((event) => {
    if (!seekBarRef.current || !videoRef.current || displayedDuration <= 0) return;

    const rect = seekBarRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const targetDisplayedTime = percent * displayedDuration;
    const targetRealTime = hasSceneCuts
      ? mapKeptToRealTime(targetDisplayedTime, keptScenes)
      : targetDisplayedTime;

    videoRef.current.currentTime = targetRealTime;
    setRealCurrentTime(targetRealTime);
    onTimeUpdate?.(targetRealTime);
  }, [displayedDuration, hasSceneCuts, keptScenes, onTimeUpdate, videoRef]);

  const handleBackgroundImageChange = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const nextBackground = await createImageFrameBackgroundFromFile(file);
      onFrameBackgroundChange?.(nextBackground);
    } catch (error) {
      console.error('Background image selection failed:', error);
      alert(`Không thể dùng ảnh nền bìa: ${error.message}`);
    } finally {
      event.target.value = '';
    }
  }, [onFrameBackgroundChange]);

  useEffect(() => {
    let isDisposed = false;

    loadFrameBackgroundImage(frameBackground)
      .then((image) => {
        if (!isDisposed) {
          setFrameBackgroundImage(image);
        }
      })
      .catch((error) => {
        console.error('Failed to load frame background image:', error);
        if (!isDisposed) {
          setFrameBackgroundImage(null);
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [frameBackground]);

  useEffect(() => {
    const handleKeyPress = (event) => {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
      if (event.code === 'Space') {
        event.preventDefault();
        handlePlayPause();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handlePlayPause]);

  useEffect(() => {
    const mediaElement = videoRef.current;
    const voiceoverElement = voiceoverRef.current;

    return () => {
      if (!mediaElement) return;
      mediaElement.pause();
      mediaElement.removeAttribute('src');
      mediaElement.load();
      voiceoverElement?.pause();
    };
  }, [videoRef]);

  useEffect(() => {
    syncVoiceoverTime(false);
  }, [syncVoiceoverTime]);

  useEffect(() => {
    const mediaElement = videoRef.current;
    if (!mediaElement) {
      return;
    }

    mediaElement.volume = effectiveVideoVolume;
  }, [effectiveVideoVolume, videoRef]);

  useEffect(() => {
    const audioElement = voiceoverRef.current;
    if (!audioElement) return;

    if (!voiceoverTrack?.previewUrl) {
      audioElement.pause();
      audioElement.currentTime = 0;
      return;
    }

    audioElement.volume = effectiveVoiceoverVolume;
    syncVoiceoverTime(true);

    if (!isPlaying) {
      audioElement.pause();
      return;
    }

    const playPromise = audioElement.play();
    playPromise?.catch((error) => {
      console.error('Voiceover playback failed:', error);
    });
  }, [effectiveVoiceoverVolume, isPlaying, syncVoiceoverTime, voiceoverTrack?.previewUrl]);

  const handlePlay = useCallback(() => syncPlaybackState(), [syncPlaybackState]);
  const handlePause = useCallback(() => setIsPlaying(false), []);
  const handleEnded = useCallback(() => setIsPlaying(false), []);

  const progress = displayedDuration > 0 ? (displayedTime / displayedDuration) * 100 : 0;

  const activeSubtitle = subtitles?.find(
    (subtitle) => realCurrentTime >= subtitle.start && realCurrentTime <= subtitle.end,
  );

  useEffect(() => {
    const canvasElement = canvasRef.current;
    const videoElement = videoRef.current;
    if (!canvasElement || !videoElement) return undefined;

    canvasElement.width = framePreset.width;
    canvasElement.height = framePreset.height;

    const context = canvasElement.getContext('2d', { alpha: false });
    if (!context) return undefined;

    const renderFrame = () => {
      drawFrameComposition(context, {
        framePreset,
        frameBackground,
        backgroundImage: frameBackgroundImage,
        videoElement,
        subtitleText: activeSubtitle?.text || '',
      });
      animationFrameRef.current = window.requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [activeSubtitle?.text, frameBackground, frameBackgroundImage, framePreset, videoRef]);

  const frameStageStyle = useMemo(() => ({
    aspectRatio: `${framePreset.width} / ${framePreset.height}`,
    backgroundColor: getFrameBackgroundFillColor(frameBackground),
    maxWidth: `${Math.round((450 * framePreset.width) / framePreset.height)}px`,
  }), [frameBackground, framePreset.height, framePreset.width]);

  const handleVideoVolumeChange = useCallback((nextVolume) => {
    setCustomizedAudioTrackKey(currentAudioTrackKey);
    setVideoVolume(Math.max(0, Math.min(1, nextVolume)));
  }, [currentAudioTrackKey]);

  const handleVoiceoverVolumeChange = useCallback((nextVolume) => {
    setCustomizedAudioTrackKey(currentAudioTrackKey);
    setVoiceoverVolume(Math.max(0, Math.min(1, nextVolume)));
  }, [currentAudioTrackKey]);

  const handleToggleVideoMute = useCallback(() => {
    setCustomizedAudioTrackKey(currentAudioTrackKey);
    setVideoVolume(effectiveVideoVolume > 0 ? 0 : 1);
  }, [currentAudioTrackKey, effectiveVideoVolume]);

  return (
    <div className="video-player-container dev-locator-host" id="video-player">
      <DeveloperLocator code="panel.video-player" title="Video Player" />
      <VideoPlayerSidebar
        activeSection={activeSidebarSection}
        title={sidebarTitle}
        onClose={onCloseSidebarSection}
      >
        <VideoPlayerFrameControls
          visibleSection={activeSidebarSection}
          framePresetId={framePresetId}
          onFramePresetChange={onFramePresetChange}
          frameBackground={frameBackground}
          onFrameBackgroundChange={onFrameBackgroundChange}
          onBackgroundImageChange={handleBackgroundImageChange}
          videoVolume={effectiveVideoVolume}
          voiceoverVolume={effectiveVoiceoverVolume}
          onVideoVolumeChange={handleVideoVolumeChange}
          onVoiceoverVolumeChange={handleVoiceoverVolumeChange}
          hasVoiceoverTrack={hasVoiceoverTrack}
        />
      </VideoPlayerSidebar>

      <div className="video-player-workspace">
        <div className="video-player-main">
          <VideoPlayerFrameSummaryBar
            activeSection={activeSidebarSection}
            framePresetLabel={framePreset.label}
            frameBackgroundLabel={frameBackgroundLabel}
            onToggleSection={onToggleSidebarSection}
          />

          <div className="video-frame-preview">
            <div className="video-frame-stage" style={frameStageStyle}>
              <canvas ref={canvasRef} className="video-frame-canvas" onClick={handlePlayPause} />
              <video
                ref={videoRef}
                src={videoUrl}
                onLoadedMetadata={handleLoadedMetadata}
                onDurationChange={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onPlay={handlePlay}
                onPause={handlePause}
                onEnded={handleEnded}
                onClick={handlePlayPause}
                preload="metadata"
                playsInline
              />
              <audio ref={voiceoverRef} src={voiceoverTrack?.previewUrl || undefined} preload="metadata" />
            </div>
          </div>
        </div>
      </div>

      <VideoPlayerTransportControls
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        timeLabel={`${formatTime(displayedTime)} / ${formatTime(displayedDuration)}`}
        progress={progress}
        onSeek={handleSeek}
        seekBarRef={seekBarRef}
        videoVolume={effectiveVideoVolume}
        onVideoVolumeChange={handleVideoVolumeChange}
        onToggleVideoMute={handleToggleVideoMute}
      />

      {currentScene && (
        <div className="scene-indicator">
          Cảnh <span className="current-scene-label">#{keptScenes.findIndex((scene) => scene.id === currentScene.id) + 1}</span>
          {' '}({formatTime(currentScene.start)} - {formatTime(currentScene.end)})
        </div>
      )}
    </div>
  );
}
