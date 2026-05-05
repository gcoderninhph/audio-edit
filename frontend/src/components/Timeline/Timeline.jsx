import { useState, useRef, useCallback, useMemo } from 'react';
import './Timeline.css';

const SCENE_COLORS = [
  '#7c3aed', '#2563eb', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#3b82f6', '#14b8a6',
  '#f97316', '#e11d48', '#6366f1', '#0ea5e9', '#22c55e',
  '#eab308', '#f43f5e', '#a855f7', '#0891b2', '#84cc16',
];

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function Timeline({ scenes, deletedSceneIds, currentTime, duration, currentScene, onSeek, subtitles }) {
  const [hoveredScene, setHoveredScene] = useState(null);
  const [tooltipX, setTooltipX] = useState(0);
  const barRef = useRef(null);

  const handleBarClick = useCallback((e) => {
    if (!barRef.current || !duration) return;
    const rect = barRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const time = percent * duration;
    onSeek?.(time);
  }, [duration, onSeek]);

  const handleMouseMove = useCallback((e) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    setTooltipX(e.clientX - rect.left);
  }, []);

  const playheadPercent = useMemo(() => {
    if (!duration) return 0;
    return (currentTime / duration) * 100;
  }, [currentTime, duration]);

  if (!scenes || scenes.length === 0) return null;

  return (
    <div className="timeline-container" id="timeline">
      <div className="timeline-header">
        <span className="timeline-title">Timeline</span>
        <span className="timeline-title" style={{ opacity: 0.6 }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
      <div
        className="timeline-bar-wrapper"
        ref={barRef}
        onClick={handleBarClick}
        onMouseMove={handleMouseMove}
      >
        <div className="timeline-bar">
          {scenes.map((scene) => {
            const widthPercent = duration > 0 ? (scene.duration / duration) * 100 : 0;
            const isDeleted = deletedSceneIds.has(scene.id);
            const isActive = currentScene?.id === scene.id;
            const color = SCENE_COLORS[scene.id % SCENE_COLORS.length];

            return (
              <div
                key={scene.id}
                className={`timeline-scene-block ${isDeleted ? 'deleted' : ''} ${isActive ? 'active' : ''}`}
                style={{
                  width: `${widthPercent}%`,
                  background: `linear-gradient(135deg, ${color}dd, ${color}88)`,
                }}
                onMouseEnter={() => setHoveredScene(scene)}
                onMouseLeave={() => setHoveredScene(null)}
                title={`Scene ${scene.id + 1}: ${formatTime(scene.start)} - ${formatTime(scene.end)}`}
              >
                {widthPercent > 4 && (
                  <span className="timeline-scene-label">{scene.id + 1}</span>
                )}
              </div>
            );
          })}

          {/* Playhead */}
          <div
            className="timeline-playhead"
            style={{ left: `${playheadPercent}%` }}
          />
        </div>

        {/* Subtitles Track */}
        {subtitles && subtitles.length > 0 && (
          <div className="timeline-subtitles-bar">
            {subtitles.map((sub, index) => {
              const widthPercent = duration > 0 ? ((sub.end - sub.start) / duration) * 100 : 0;
              const leftPercent = duration > 0 ? (sub.start / duration) * 100 : 0;
              return (
                <div
                  key={sub.id || index}
                  className="timeline-subtitle-block"
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                  }}
                  title={`[${formatTime(sub.start)}] ${sub.text}`}
                ></div>
              );
            })}
          </div>
        )}

        {/* Tooltip */}
        {hoveredScene && (
          <div className="timeline-tooltip" style={{ left: tooltipX }}>
            Scene {hoveredScene.id + 1} | {formatTime(hoveredScene.start)} - {formatTime(hoveredScene.end)} | {hoveredScene.duration.toFixed(1)}s
            {deletedSceneIds.has(hoveredScene.id) && ' 🗑️'}
          </div>
        )}
      </div>
    </div>
  );
}
