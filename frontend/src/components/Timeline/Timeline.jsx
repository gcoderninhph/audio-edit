import { useState, useRef, useCallback, useMemo } from 'react';
import { getKeptScenes, getKeptDuration, mapRealToKeptTime, mapKeptToRealTime } from '../../utils/timeMapping';
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

export default function Timeline({ scenes, deletedSceneIds, currentTime, currentScene, onSeek, subtitles }) {
  const [hoveredScene, setHoveredScene] = useState(null);
  const [tooltipX, setTooltipX] = useState(0);
  const barRef = useRef(null);

  const keptScenes = useMemo(() => {
    return getKeptScenes(scenes, deletedSceneIds);
  }, [scenes, deletedSceneIds]);

  const keptDuration = useMemo(() => {
    return getKeptDuration(keptScenes);
  }, [keptScenes]);

  const displayedTime = useMemo(() => {
    return mapRealToKeptTime(currentTime, keptScenes);
  }, [currentTime, keptScenes]);

  const handleBarClick = useCallback((e) => {
    if (!barRef.current || keptDuration <= 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const timelineTime = percent * keptDuration;
    const realTime = mapKeptToRealTime(timelineTime, keptScenes);
    onSeek?.(realTime);
  }, [keptDuration, keptScenes, onSeek]);

  const handleMouseMove = useCallback((e) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    setTooltipX(e.clientX - rect.left);
  }, []);

  const playheadPercent = useMemo(() => {
    if (keptDuration <= 0) return 0;
    return (displayedTime / keptDuration) * 100;
  }, [displayedTime, keptDuration]);

  if (!scenes || scenes.length === 0) return null;

  return (
    <div className="timeline-container" id="timeline">
      <div className="timeline-header">
        <span className="timeline-title">Timeline</span>
        <span className="timeline-title" style={{ opacity: 0.6 }}>
          {formatTime(displayedTime)} / {formatTime(keptDuration)}
        </span>
      </div>
      <div
        className="timeline-bar-wrapper"
        ref={barRef}
        onClick={handleBarClick}
        onMouseMove={handleMouseMove}
      >
        <div className="timeline-bar">
          {keptScenes.map((scene, index) => {
            const widthPercent = keptDuration > 0 ? (scene.duration / keptDuration) * 100 : 0;
            const isActive = currentScene?.id === scene.id;
            const color = SCENE_COLORS[index % SCENE_COLORS.length];

            return (
              <div
                key={scene.id}
                className={`timeline-scene-block ${isActive ? 'active' : ''}`}
                style={{
                  width: `${widthPercent}%`,
                  background: `linear-gradient(135deg, ${color}dd, ${color}88)`,
                }}
                onMouseEnter={() => setHoveredScene(scene)}
                onMouseLeave={() => setHoveredScene(null)}
                title={`Scene ${index + 1}: ${formatTime(scene.start)} - ${formatTime(scene.end)}`}
              >
                {widthPercent > 4 && (
                  <span className="timeline-scene-label">{index + 1}</span>
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
                {subtitles.map((sub, idx) => {
              const tStart = mapRealToKeptTime(sub.start, keptScenes);
              const tEnd = mapRealToKeptTime(sub.end, keptScenes);
              const tDuration = tEnd - tStart;
              
              if (tDuration <= 0.05) return null; // Hide if entirely inside deleted scene

              const widthPercent = keptDuration > 0 ? (tDuration / keptDuration) * 100 : 0;
              const leftPercent = keptDuration > 0 ? (tStart / keptDuration) * 100 : 0;
              return (
                <div
                  key={sub.id || idx}
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
            Scene {keptScenes.findIndex(s => s.id === hoveredScene.id) + 1} | {formatTime(hoveredScene.start)} - {formatTime(hoveredScene.end)} | {hoveredScene.duration.toFixed(1)}s
          </div>
        )}
      </div>
    </div>
  );
}
