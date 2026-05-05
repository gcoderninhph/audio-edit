import { useRef, useState, useCallback, useEffect } from 'react';
import './VideoPlayer.css';

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function VideoPlayer({ videoUrl, videoRef, onTimeUpdate, onDurationChange, currentScene, scenes, subtitles }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const seekBarRef = useRef(null);

  const handleLoadedMetadata = () => {
    const dur = videoRef.current?.duration || 0;
    setDuration(dur);
    onDurationChange?.(dur);
  };

  const handleTimeUpdate = () => {
    const time = videoRef.current?.currentTime || 0;
    setCurrentTime(time);
    onTimeUpdate?.(time);
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = useCallback((e) => {
    if (!seekBarRef.current || !videoRef.current) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    videoRef.current.currentTime = percent * duration;
  }, [duration, videoRef]);

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (videoRef.current) videoRef.current.volume = v;
  };

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPause();
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  const handleEnded = () => setIsPlaying(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Find active subtitle
  const activeSubtitle = subtitles?.find(
    (sub) => currentTime >= sub.start && currentTime <= sub.end
  );

  return (
    <div className="video-player-container" id="video-player">
      <video
        ref={videoRef}
        src={videoUrl}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onClick={handlePlayPause}
        playsInline
      />

      {/* Subtitle Overlay */}
      {activeSubtitle && (
        <div className="subtitle-overlay">
          {activeSubtitle.text}
        </div>
      )}

      <div className="video-controls">
        <button className="control-btn" onClick={handlePlayPause} id="play-pause-btn" title={isPlaying ? 'Tạm dừng' : 'Phát'}>
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          )}
        </button>

        <span className="time-display">{formatTime(currentTime)} / {formatTime(duration)}</span>

        <div className="seek-bar-container" ref={seekBarRef} onClick={handleSeek}>
          <div className="seek-bar-track">
            <div className="seek-bar-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="volume-control">
          <button className="control-btn" onClick={() => {
            const newVol = volume > 0 ? 0 : 1;
            setVolume(newVol);
            if (videoRef.current) videoRef.current.volume = newVol;
          }}>
            {volume > 0 ? (
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
            value={volume}
            onChange={handleVolumeChange}
          />
        </div>
      </div>

      {currentScene && (
        <div className="scene-indicator">
          Cảnh <span className="current-scene-label">#{currentScene.id + 1}</span>
          {' '}({formatTime(currentScene.start)} - {formatTime(currentScene.end)})
        </div>
      )}
    </div>
  );
}
