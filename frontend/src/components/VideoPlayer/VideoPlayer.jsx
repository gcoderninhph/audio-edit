import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  createImageFrameBackgroundFromFile,
  getFrameBackgroundLabel,
  getFramePresetById,
} from '../../utils/frameComposer';
import { getSubtitleAnchorOption } from '../../utils/subtitleRenderModel';
import { getKeptScenes, getKeptDuration, mapRealToKeptTime, mapKeptToRealTime } from '../../utils/timeMapping';
import {
  applyMediaVolume,
  formatPlaybackTimestamp,
  getPlaybackProgress,
  resolvePointerSeekTime,
  toggleMediaPlayback,
} from '../../utils/videoDisplayLogic';
import VideoPlayerFrameControls from './VideoPlayerFrameControls';
import VideoPlayerFrameSummaryBar from './VideoPlayerFrameSummaryBar';
import VideoPlayerPreviewStage from './VideoPlayerPreviewStage';
import VideoPlayerSidebar from './VideoPlayerSidebar';
import VideoPlayerTransportControls from './VideoPlayerTransportControls';
import useVideoPlayerVoiceover from './useVideoPlayerVoiceover';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import { useI18n } from '../../i18n/useI18n';
import './VideoPlayer.css';

const FRAME_SIDEBAR_SECTIONS = Object.freeze({
  FRAME: 'frame',
  EXPORT: 'export',
  BACKGROUND: 'background',
  AUDIO: 'audio',
  SUBTITLE: 'subtitle',
  SCENE: 'scene',
  SCENE_BULK: 'scene-bulk',
});

export default function VideoPlayer({
  videoUrl,
  videoRef,
  onTimeUpdate,
  onDurationChange,
  framePresetId,
  onFramePresetChange,
  exportQualityProfileId,
  onExportQualityProfileChange,
  exportFileName,
  onExportFileNameChange,
  exportOutputDirectory,
  onChooseExportOutputDirectory,
  frameBackground,
  onFrameBackgroundChange,
  subtitleSettings,
  onSubtitleSettingsChange,
  currentScene,
  scenes,
  deletedSceneIds,
  subtitles,
  voiceoverTrack,
  videoVolume,
  voiceoverVolume,
  onVideoVolumeChange,
  onVoiceoverVolumeChange,
  onToggleVideoMute,
  selectedScene,
  selectedSceneIndex,
  onSceneMotionChange,
  onDetectSceneFace,
  bulkMotionRules,
  onBulkMotionRulesChange,
  onApplyBulkMotionConfig,
  activeSidebarSection,
  onToggleSidebarSection,
  onCloseSidebarSection,
  hideWatermark = false,
}) {
  const { t } = useI18n();
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [realCurrentTime, setRealCurrentTime] = useState(0);
  const seekBarRef = useRef(null);
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
  const sidebarTitleBySection = useMemo(() => ({
    [FRAME_SIDEBAR_SECTIONS.FRAME]: t('panel.videoPlayer.sidebar.frame'),
    [FRAME_SIDEBAR_SECTIONS.EXPORT]: t('panel.videoPlayer.sidebar.export'),
    [FRAME_SIDEBAR_SECTIONS.BACKGROUND]: t('panel.videoPlayer.sidebar.background'),
    [FRAME_SIDEBAR_SECTIONS.AUDIO]: t('panel.videoPlayer.sidebar.audio'),
    [FRAME_SIDEBAR_SECTIONS.SUBTITLE]: t('panel.videoPlayer.sidebar.subtitle'),
    [FRAME_SIDEBAR_SECTIONS.SCENE]: t('panel.videoPlayer.sidebar.scene'),
    [FRAME_SIDEBAR_SECTIONS.SCENE_BULK]: t('panel.videoPlayer.sidebar.sceneBulk'),
  }), [t]);
  const sidebarTitle = sidebarTitleBySection[activeSidebarSection] || t('panel.videoPlayer.sidebar.defaultTitle');
  const subtitleAnchorLabel = useMemo(() => getSubtitleAnchorOption(subtitleSettings?.anchor).label, [subtitleSettings]);
  const {
    voiceoverRef,
    hasVoiceoverTrack,
  } = useVideoPlayerVoiceover({
    displayedTime,
    isPlaying,
    voiceoverVolume,
    voiceoverTrack,
  });

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
    void toggleMediaPlayback(mediaElement, {
      restartTime: keptScenes[0]?.start ?? 0,
      onPaused: () => setIsPlaying(false),
      onPlaying: () => syncPlaybackState(),
      onRestart: (nextTime) => {
        setRealCurrentTime(nextTime);
        onTimeUpdate?.(nextTime);
      },
      onError: (error) => {
        console.error('Video playback failed:', error);
        setIsPlaying(false);
      },
    });
  }, [keptScenes, onTimeUpdate, syncPlaybackState, videoRef]);

  const handleSeek = useCallback((event) => {
    if (!seekBarRef.current || !videoRef.current || displayedDuration <= 0) return;

    const targetRealTime = resolvePointerSeekTime({
      event,
      seekContainer: seekBarRef.current,
      duration: displayedDuration,
      mapTargetTime: (targetDisplayedTime) => (hasSceneCuts
        ? mapKeptToRealTime(targetDisplayedTime, keptScenes)
        : targetDisplayedTime),
    });
    if (!Number.isFinite(targetRealTime)) {
      return;
    }

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
      alert(error?.message || 'Unable to use the selected cover image.');
    } finally {
      event.target.value = '';
    }
  }, [onFrameBackgroundChange]);

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
  }, [videoRef, voiceoverRef]);

  useEffect(() => {
    const mediaElement = videoRef.current;
    if (!mediaElement) {
      return;
    }

    applyMediaVolume(mediaElement, videoVolume, 1);
  }, [videoRef, videoVolume]);

  const handlePlay = useCallback(() => syncPlaybackState(), [syncPlaybackState]);
  const handlePause = useCallback(() => setIsPlaying(false), []);
  const handleEnded = useCallback(() => setIsPlaying(false), []);

  const progress = getPlaybackProgress(displayedTime, displayedDuration);

  const activeSubtitle = subtitles?.find(
    (subtitle) => realCurrentTime >= subtitle.start && realCurrentTime <= subtitle.end,
  );

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
          exportQualityProfileId={exportQualityProfileId}
          onExportQualityProfileChange={onExportQualityProfileChange}
          exportFileName={exportFileName}
          onExportFileNameChange={onExportFileNameChange}
          exportOutputDirectory={exportOutputDirectory}
          onChooseExportOutputDirectory={onChooseExportOutputDirectory}
          frameBackground={frameBackground}
          onFrameBackgroundChange={onFrameBackgroundChange}
          subtitleSettings={subtitleSettings}
          onSubtitleSettingsChange={onSubtitleSettingsChange}
          onBackgroundImageChange={handleBackgroundImageChange}
          videoVolume={videoVolume}
          voiceoverVolume={voiceoverVolume}
          onVideoVolumeChange={onVideoVolumeChange}
          onVoiceoverVolumeChange={onVoiceoverVolumeChange}
          hasVoiceoverTrack={hasVoiceoverTrack}
          selectedScene={selectedScene}
          selectedSceneIndex={selectedSceneIndex}
          onSceneMotionChange={onSceneMotionChange}
          onDetectSceneFace={onDetectSceneFace}
          bulkMotionScenes={keptScenes}
          bulkMotionRules={bulkMotionRules}
          onBulkMotionRulesChange={onBulkMotionRulesChange}
          onApplyBulkMotionConfig={onApplyBulkMotionConfig}
        />
      </VideoPlayerSidebar>

      <div className="video-player-workspace">
        <div className="video-player-main">
          <VideoPlayerFrameSummaryBar
            activeSection={activeSidebarSection}
            framePresetLabel={framePreset.label}
            frameBackgroundLabel={frameBackgroundLabel}
            subtitleLabel={subtitleAnchorLabel}
            onToggleSection={onToggleSidebarSection}
          />

          <VideoPlayerPreviewStage
            framePreset={framePreset}
            frameBackground={frameBackground}
            videoRef={videoRef}
            voiceoverRef={voiceoverRef}
            videoUrl={videoUrl}
            scenes={scenes}
            deletedSceneIds={deletedSceneIds}
            subtitleText={activeSubtitle?.text || ''}
            subtitleSettings={subtitleSettings}
            voiceoverTrack={voiceoverTrack}
            onLoadedMetadata={handleLoadedMetadata}
            onDurationChange={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={handleEnded}
            onTogglePlayback={handlePlayPause}
            hideWatermark={hideWatermark}
          />
        </div>
      </div>

      <VideoPlayerTransportControls
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        timeLabel={`${formatPlaybackTimestamp(displayedTime)} / ${formatPlaybackTimestamp(displayedDuration)}`}
        progress={progress}
        onSeek={handleSeek}
        seekBarRef={seekBarRef}
        hasVoiceoverTrack={hasVoiceoverTrack}
        videoVolume={videoVolume}
        voiceoverVolume={voiceoverVolume}
        onVideoVolumeChange={onVideoVolumeChange}
        onVoiceoverVolumeChange={onVoiceoverVolumeChange}
        onToggleVideoMute={onToggleVideoMute}
      />

      {currentScene && (
        <div className="scene-indicator">
          {t('panel.videoPlayer.sceneIndicator.scene')} <span className="current-scene-label">#{keptScenes.findIndex((scene) => scene.id === currentScene.id) + 1}</span>
          {' '}({formatPlaybackTimestamp(currentScene.start)} - {formatPlaybackTimestamp(currentScene.end)})
        </div>
      )}
    </div>
  );
}
