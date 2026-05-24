import { Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/useI18n';
import {
  applyMediaVolume,
  clampMediaVolume,
  formatPlaybackTimestamp,
  getPlaybackProgress,
  resolvePointerSeekTime,
  resolvePreviewAudioMix,
  toggleMediaPlayback,
  toggleMutedVolume,
} from '../../utils/videoDisplayLogic';
import { DEFAULT_FRAME_BACKGROUND, DEFAULT_FRAME_PRESET_ID, getFramePresetById, sanitizeFrameBackground } from '../../utils/frameComposer';
import { getLocalProject, materializeLocalProjectVoiceover, releaseObjectUrl } from '../../utils/projectStorage';
import { DEFAULT_SUBTITLE_SETTINGS, normalizeSubtitleSettings } from '../../utils/subtitleRenderModel';
import { DEFAULT_SUBTITLE_LANGUAGE_KEY, getSubtitlesForLanguage, normalizeActiveSubtitleLanguage } from '../../utils/subtitleTracks';
import VideoPlayerPreviewStage from '../VideoPlayer/VideoPlayerPreviewStage';
import useVideoPlayerVoiceover from '../VideoPlayer/useVideoPlayerVoiceover';

export default function SeriesVideoPlayer({ project, hideWatermark = false }) {
  const { t } = useI18n();
  const videoRef = useRef(null);
  const voiceoverUrlRef = useRef('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoVolume, setVideoVolume] = useState(1);
  const [voiceoverVolume, setVoiceoverVolume] = useState(1);
  const [projectPreviewSettings, setProjectPreviewSettings] = useState({
    deletedSceneIds: new Set(),
    frameBackground: DEFAULT_FRAME_BACKGROUND,
    framePresetId: DEFAULT_FRAME_PRESET_ID,
    scenes: [],
    subtitleSettings: DEFAULT_SUBTITLE_SETTINGS,
    subtitles: [],
    voiceoverTrack: null,
  });

  const framePreset = useMemo(
    () => getFramePresetById(projectPreviewSettings.framePresetId),
    [projectPreviewSettings.framePresetId],
  );
  const progress = getPlaybackProgress(currentTime, duration);
  const { voiceoverRef } = useVideoPlayerVoiceover({
    displayedTime: currentTime,
    isPlaying,
    voiceoverTrack: projectPreviewSettings.voiceoverTrack,
    voiceoverVolume,
  });

  const activeSubtitle = useMemo(
    () => projectPreviewSettings.subtitles.find((subtitle) => currentTime >= subtitle.start && currentTime <= subtitle.end),
    [currentTime, projectPreviewSettings.subtitles],
  );

  useEffect(() => {
    let isDisposed = false;

    const restoreProjectPreviewSettings = async () => {
      try {
        const fullProject = await getLocalProject(project.id);
        const restoredVoiceover = await materializeLocalProjectVoiceover(project.id);
        if (isDisposed) {
          releaseObjectUrl(restoredVoiceover?.previewUrl || '');
          return;
        }

        const activeSubtitleLanguage = normalizeActiveSubtitleLanguage(
          fullProject?.active_subtitle_language || DEFAULT_SUBTITLE_LANGUAGE_KEY,
          fullProject?.subtitle_tracks,
        );
        const subtitles = getSubtitlesForLanguage(fullProject?.subtitle_tracks, activeSubtitleLanguage);

        releaseObjectUrl(voiceoverUrlRef.current);
        voiceoverUrlRef.current = restoredVoiceover?.previewUrl || '';

        setProjectPreviewSettings({
          deletedSceneIds: new Set(Array.isArray(fullProject?.deleted_ids) ? fullProject.deleted_ids : []),
          frameBackground: sanitizeFrameBackground(fullProject?.frame_background || DEFAULT_FRAME_BACKGROUND),
          framePresetId: fullProject?.frame_preset_id || DEFAULT_FRAME_PRESET_ID,
          scenes: Array.isArray(fullProject?.scenes) ? fullProject.scenes : [],
          subtitleSettings: normalizeSubtitleSettings(fullProject?.subtitle_settings || DEFAULT_SUBTITLE_SETTINGS),
          subtitles,
          voiceoverTrack: restoredVoiceover
            ? {
              duration: restoredVoiceover.duration || 0,
              fileName: restoredVoiceover.fileName || '',
              languageKey: restoredVoiceover.languageKey || activeSubtitleLanguage,
              previewUrl: restoredVoiceover.previewUrl,
              startTime: 0,
            }
            : null,
        });

        const restoredMix = resolvePreviewAudioMix(fullProject?.export_audio_mix || {}, restoredVoiceover
          ? {
            fileName: restoredVoiceover.fileName || '',
            previewUrl: restoredVoiceover.previewUrl,
            storedFileName: restoredVoiceover.storedFileName || '',
          }
          : null);
        setVideoVolume(restoredMix.videoVolume);
        setVoiceoverVolume(restoredMix.voiceoverVolume);
      } catch (error) {
        console.error('Failed to restore series project preview settings:', error);
        if (!isDisposed) {
          setProjectPreviewSettings({
            deletedSceneIds: new Set(),
            frameBackground: DEFAULT_FRAME_BACKGROUND,
            framePresetId: DEFAULT_FRAME_PRESET_ID,
            scenes: [],
            subtitleSettings: DEFAULT_SUBTITLE_SETTINGS,
            subtitles: [],
            voiceoverTrack: null,
          });
          setVideoVolume(1);
          setVoiceoverVolume(0);
        }
      }
    };

    void restoreProjectPreviewSettings();

    return () => {
      isDisposed = true;
      releaseObjectUrl(voiceoverUrlRef.current);
      voiceoverUrlRef.current = '';
    };
  }, [project.id]);

  useEffect(() => {
    applyMediaVolume(videoRef.current, videoVolume, 1);
  }, [videoVolume]);

  const syncPlaybackState = () => {
    const video = videoRef.current;
    if (!video) {
      setIsPlaying(false);
      return;
    }

    setIsPlaying(!video.paused && !video.ended);
  };

  const handleTogglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;

    await toggleMediaPlayback(video, {
      onPaused: () => setIsPlaying(false),
      onPlaying: () => syncPlaybackState(),
      onRestart: () => setCurrentTime(0),
      restartTime: 0,
      onError: (error) => {
        console.error('Series preview playback failed:', error);
        setIsPlaying(false);
      },
    });
  };

  const handleSeek = (event) => {
    const video = videoRef.current;
    if (!video || duration <= 0) return;

    const targetTime = resolvePointerSeekTime({
      event,
      seekContainer: event.currentTarget,
      duration,
    });
    if (!Number.isFinite(targetTime)) {
      return;
    }

    video.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const handleVideoVolumeChange = (event) => {
    setVideoVolume(clampMediaVolume(parseFloat(event.target.value), 1));
  };

  const handleVoiceoverVolumeChange = (event) => {
    setVoiceoverVolume(clampMediaVolume(parseFloat(event.target.value), 1));
  };

  const handleToggleVideoMute = () => {
    setVideoVolume((currentVolume) => toggleMutedVolume(currentVolume, 1));
  };

  const hasVoiceoverTrack = Boolean(projectPreviewSettings.voiceoverTrack?.previewUrl);

  if (!project?.preview_url) {
    return <div className="series-video-empty">{t('dashboard.noVideoPreview')}</div>;
  }

  return (
    <div className="series-player-shell">
      <div className="series-frame-preview">
        <VideoPlayerPreviewStage
          framePreset={framePreset}
          frameBackground={projectPreviewSettings.frameBackground}
          videoRef={videoRef}
          voiceoverRef={voiceoverRef}
          videoUrl={project.preview_url}
          scenes={projectPreviewSettings.scenes}
          deletedSceneIds={projectPreviewSettings.deletedSceneIds}
          subtitleText={activeSubtitle?.text || ''}
          subtitleSettings={projectPreviewSettings.subtitleSettings}
          voiceoverTrack={projectPreviewSettings.voiceoverTrack}
          onLoadedMetadata={(event) => {
            const nextDuration = event.currentTarget.duration || 0;
            setDuration(nextDuration);
            syncPlaybackState();
          }}
          onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            let nextTime = video.currentTime || 0;
            if (!video.paused && projectPreviewSettings.scenes.length > 0 && projectPreviewSettings.deletedSceneIds.size > 0) {
              const activeScene = projectPreviewSettings.scenes.find((scene) => nextTime >= scene.start && nextTime < scene.end);
              if (activeScene && projectPreviewSettings.deletedSceneIds.has(activeScene.id)) {
                const nextKeptScene = projectPreviewSettings.scenes.find(
                  (scene) => scene.start >= activeScene.end && !projectPreviewSettings.deletedSceneIds.has(scene.id),
                );
                if (nextKeptScene) {
                  nextTime = nextKeptScene.start + 0.05;
                  video.currentTime = nextTime;
                } else {
                  video.pause();
                  setIsPlaying(false);
                  nextTime = duration;
                  video.currentTime = nextTime;
                }
              }
            }
            setCurrentTime(nextTime);
          }}
          onPlay={() => syncPlaybackState()}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onTogglePlayback={handleTogglePlayback}
          hideWatermark={hideWatermark}
        />
      </div>
      <div className="series-video-controls">
        <button type="button" className="control-btn" onClick={handleTogglePlayback} aria-label={isPlaying ? 'Pause video' : 'Play video'}>
          {isPlaying ? <Pause /> : <Play />}
        </button>
        <div className="seek-bar-container" onClick={handleSeek} role="slider" aria-valuemin="0" aria-valuemax={Math.floor(duration)} aria-valuenow={Math.floor(currentTime)} tabIndex={0}>
          <div className="seek-bar-track"><div className="seek-bar-fill" style={{ width: `${progress}%` }} /></div>
        </div>
        <div className="time-display">{formatPlaybackTimestamp(currentTime)} / {formatPlaybackTimestamp(duration)}</div>
        <div className="series-volume-controls">
          <div className="series-volume-group">
            <button type="button" className="control-btn" onClick={handleToggleVideoMute} title={t('panel.videoPlayer.transport.sourceVolume')}>
              {videoVolume > 0 ? 'V' : 'M'}
            </button>
            <input
              type="range"
              className="volume-slider"
              min="0"
              max="1"
              step="0.05"
              value={videoVolume}
              onChange={handleVideoVolumeChange}
              aria-label={t('panel.videoPlayer.frameControls.videoVolume')}
            />
          </div>
          {hasVoiceoverTrack && (
            <div className="series-volume-group">
              <span className="series-volume-label">VO</span>
              <input
                type="range"
                className="volume-slider"
                min="0"
                max="1"
                step="0.05"
                value={voiceoverVolume}
                onChange={handleVoiceoverVolumeChange}
                aria-label={t('panel.videoPlayer.frameControls.voiceoverVolume')}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}