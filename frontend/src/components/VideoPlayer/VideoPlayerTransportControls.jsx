import { useI18n } from '../../i18n/useI18n';

export default function VideoPlayerTransportControls({
  isPlaying,
  onPlayPause,
  timeLabel,
  progress,
  onSeek,
  seekBarRef,
  hasVoiceoverTrack,
  videoVolume,
  voiceoverVolume,
  onVideoVolumeChange,
  onVoiceoverVolumeChange,
  onToggleVideoMute,
}) {
  const { t } = useI18n();

  return (
    <div className="video-controls">
      <button className="control-btn" onClick={onPlayPause} id="play-pause-btn" title={isPlaying ? t('panel.videoPlayer.transport.pause') : t('panel.videoPlayer.transport.play')}>
        {isPlaying ? (
          <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
        )}
      </button>

      <span className="time-display">{timeLabel}</span>

      <div className="seek-bar-container" ref={seekBarRef} onClick={onSeek}>
        <div className="seek-bar-track">
          <div className="seek-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="volume-control">
        <div className="volume-group">
          <button className="control-btn" onClick={onToggleVideoMute} title={t('panel.videoPlayer.transport.sourceVolume')}>
            {videoVolume > 0 ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
            )}
          </button>
          <input
            type="range"
            className="volume-slider"
            min="0"
            max="1"
            step="0.05"
            value={videoVolume}
            onChange={(event) => onVideoVolumeChange(parseFloat(event.target.value))}
            aria-label={t('panel.videoPlayer.frameControls.videoVolume')}
          />
        </div>

        {hasVoiceoverTrack && (
          <div className="volume-group volume-group-voiceover">
            <span className="volume-group-label">VO</span>
            <input
              type="range"
              className="volume-slider"
              min="0"
              max="1"
              step="0.05"
              value={voiceoverVolume}
              onChange={(event) => onVoiceoverVolumeChange(parseFloat(event.target.value))}
              aria-label={t('panel.videoPlayer.frameControls.voiceoverVolume')}
            />
          </div>
        )}
      </div>
    </div>
  );
}
