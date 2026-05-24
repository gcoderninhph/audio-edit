import { useState, useRef, useCallback, useMemo } from 'react';
import { getKeptScenes, getKeptDuration, mapRealToKeptTime, mapKeptToRealTime } from '../../utils/timeMapping';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import { useI18n } from '../../i18n/useI18n';
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

export default function Timeline({
  scenes,
  deletedSceneIds,
  currentTime,
  duration = 0,
  currentScene,
  onSeek,
  subtitles,
  voiceoverTrack,
  onSubtitleClick,
  onVoiceoverClick,
}) {
  const { t } = useI18n();
  const [hoveredScene, setHoveredScene] = useState(null);
  const [tooltipX, setTooltipX] = useState(0);
  const barRef = useRef(null);

  const keptScenes = useMemo(() => {
    return getKeptScenes(scenes, deletedSceneIds);
  }, [scenes, deletedSceneIds]);

  const keptDuration = useMemo(() => {
    return getKeptDuration(keptScenes);
  }, [keptScenes]);

  const hasDetectedScenes = keptScenes.length > 0;

  const totalDuration = useMemo(() => {
    if (keptDuration > 0) return keptDuration;
    return duration > 0 ? duration : 0;
  }, [duration, keptDuration]);

  const displayedTime = useMemo(() => {
    if (!hasDetectedScenes) {
      return Math.max(0, Math.min(currentTime, totalDuration));
    }

    return mapRealToKeptTime(currentTime, keptScenes);
  }, [currentTime, hasDetectedScenes, keptScenes, totalDuration]);

  const handleBarClick = useCallback((e) => {
    if (!barRef.current || totalDuration <= 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const timelineTime = percent * totalDuration;
    const realTime = hasDetectedScenes
      ? mapKeptToRealTime(timelineTime, keptScenes)
      : timelineTime;
    onSeek?.(realTime);
  }, [hasDetectedScenes, keptScenes, onSeek, totalDuration]);

  const handleMouseMove = useCallback((e) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    setTooltipX(e.clientX - rect.left);
  }, []);

  const handleVoiceoverClick = useCallback((event) => {
    event.stopPropagation();
    onVoiceoverClick?.();
  }, [onVoiceoverClick]);

  const handleVoiceoverKeyDown = useCallback((event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    onVoiceoverClick?.();
  }, [onVoiceoverClick]);

  const handleSubtitleClick = useCallback((event) => {
    event.stopPropagation();
    onSubtitleClick?.();
  }, [onSubtitleClick]);

  const handleSubtitleKeyDown = useCallback((event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    onSubtitleClick?.();
  }, [onSubtitleClick]);

  const playheadPercent = useMemo(() => {
    if (totalDuration <= 0) return 0;
    return (displayedTime / totalDuration) * 100;
  }, [displayedTime, totalDuration]);

  const timelineSubtitles = useMemo(() => {
    if (!subtitles || subtitles.length === 0 || totalDuration <= 0) {
      return [];
    }

    return subtitles
      .map((sub, idx) => {
        const timelineStart = hasDetectedScenes ? mapRealToKeptTime(sub.start, keptScenes) : sub.start;
        const timelineEnd = hasDetectedScenes ? mapRealToKeptTime(sub.end, keptScenes) : sub.end;
        const timelineDuration = timelineEnd - timelineStart;

        if (timelineDuration <= 0.05) {
          return null;
        }

        return {
          key: sub.id || idx,
          leftPercent: (timelineStart / totalDuration) * 100,
          widthPercent: (timelineDuration / totalDuration) * 100,
          title: `[${formatTime(sub.start)}] ${sub.text}`,
        };
      })
      .filter(Boolean);
  }, [hasDetectedScenes, keptScenes, subtitles, totalDuration]);

  const timelineVoiceover = useMemo(() => {
    if (!voiceoverTrack || totalDuration <= 0) {
      return null;
    }

    const startTime = Math.max(0, voiceoverTrack.startTime || 0);
    const boundedDuration = voiceoverTrack.duration > 0
      ? Math.min(voiceoverTrack.duration, Math.max(totalDuration - startTime, 0))
      : Math.max(totalDuration - startTime, 0);

    return {
      fileName: voiceoverTrack.fileName,
      leftPercent: (startTime / totalDuration) * 100,
      widthPercent: (boundedDuration / totalDuration) * 100,
    };
  }, [totalDuration, voiceoverTrack]);

  return (
    <div className="timeline-container dev-locator-host" id="timeline">
      <DeveloperLocator code="panel.timeline.content" title="Timeline Content" />
      <div className="timeline-header">
        <span className="timeline-title">{t('panel.timeline.title')}</span>
        <span className="timeline-title" style={{ opacity: 0.6 }}>
          {formatTime(displayedTime)} / {formatTime(totalDuration)}
        </span>
      </div>
      <div
        className="timeline-bar-wrapper"
        ref={barRef}
        onClick={handleBarClick}
        onMouseMove={handleMouseMove}
      >
        <div className="timeline-bar">
          {hasDetectedScenes ? (
            keptScenes.map((scene, index) => {
              const widthPercent = totalDuration > 0 ? (scene.duration / totalDuration) * 100 : 0;
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
                  title={t('panel.timeline.sceneTitle', {
                    index: index + 1,
                    start: formatTime(scene.start),
                    end: formatTime(scene.end),
                  })}
                >
                  {widthPercent > 4 && (
                    <span className="timeline-scene-label">{index + 1}</span>
                  )}
                </div>
              );
            })
          ) : (
            <div
              className="timeline-scene-block active"
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.85), rgba(14, 165, 233, 0.55))',
              }}
              title={totalDuration > 0 ? t('panel.timeline.fullVideo', { duration: formatTime(totalDuration) }) : t('panel.timeline.loadingDuration')}
            >
              <span className="timeline-scene-label">{t('panel.timeline.video')}</span>
            </div>
          )}

          {/* Playhead */}
          <div
            className="timeline-playhead"
            style={{ left: `${playheadPercent}%` }}
          />
        </div>

        {/* Subtitles Track */}
        {timelineSubtitles.length > 0 && (
          <div className="timeline-subtitles-bar dev-locator-host" role="button" tabIndex={0} onClick={handleSubtitleClick} onKeyDown={handleSubtitleKeyDown} title={t('panel.timeline.subtitleTrackTitle')}>
            <DeveloperLocator code="panel.timeline.subtitles" title="Timeline Subtitle Track" />
            {timelineSubtitles.map((subtitle) => (
              <div
                key={subtitle.key}
                className="timeline-subtitle-block"
                style={{
                  left: `${subtitle.leftPercent}%`,
                  width: `${subtitle.widthPercent}%`,
                }}
                title={subtitle.title}
              ></div>
            ))}
          </div>
        )}

        {timelineVoiceover && (
          <div className="timeline-voiceover-bar dev-locator-host">
            <DeveloperLocator code="panel.timeline.voiceover" title="Timeline Voiceover Track" />
            <div
              className="timeline-voiceover-block"
              style={{
                left: `${timelineVoiceover.leftPercent}%`,
                width: `${timelineVoiceover.widthPercent}%`,
              }}
              title={t('panel.timeline.voiceoverTitle', { fileName: timelineVoiceover.fileName })}
              role="button"
              tabIndex={0}
              onClick={handleVoiceoverClick}
              onKeyDown={handleVoiceoverKeyDown}
            >
              <span className="timeline-voiceover-label">{t('panel.timeline.voiceover')}</span>
            </div>
          </div>
        )}

        {/* Tooltip */}
        {hasDetectedScenes && hoveredScene && (
          <div className="timeline-tooltip" style={{ left: tooltipX }}>
            {t('panel.timeline.tooltip', {
              index: keptScenes.findIndex((scene) => scene.id === hoveredScene.id) + 1,
              start: formatTime(hoveredScene.start),
              end: formatTime(hoveredScene.end),
              duration: hoveredScene.duration.toFixed(1),
            })}
          </div>
        )}
      </div>
    </div>
  );
}
