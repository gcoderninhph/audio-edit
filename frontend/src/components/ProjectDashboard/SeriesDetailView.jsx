import { ArrowLeft, ExternalLink, Pause, Play } from 'lucide-react';
import { useRef, useState } from 'react';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import { ProjectActionMenu } from './ProjectDashboardCards';
import { getProjectTitle, normalizeEpisodeNumber } from './projectDashboardModel';

function EpisodeNumberEditor({ initialValue, onCancel, onSave }) {
  const [value, setValue] = useState(String(initialValue || 1));

  return (
    <input
      className="series-episode-input"
      type="number"
      min="1"
      step="1"
      value={value}
      autoFocus
      onBlur={() => onSave(value)}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSave(value);
        if (event.key === 'Escape') onCancel();
      }}
    />
  );
}

function formatPlaybackTime(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = Math.floor(safeSeconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function SeriesVideoPlayer({ project }) {
  const videoRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const handleTogglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) await video.play();
    else video.pause();
  };

  const handleSeek = (event) => {
    const video = videoRef.current;
    if (!video || duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    video.currentTime = ratio * duration;
  };

  if (!project?.preview_url) {
    return <div className="series-video-empty">No video preview</div>;
  }

  return (
    <div className="series-player-shell">
      <div className="series-frame-preview">
        <div className="series-frame-stage">
          <video
            ref={videoRef}
            className="series-video-surface"
            src={project.preview_url}
            preload="metadata"
            playsInline
            onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
          />
        </div>
      </div>
      <div className="series-video-controls">
        <button type="button" className="control-btn" onClick={handleTogglePlayback} aria-label={isPlaying ? 'Pause video' : 'Play video'}>
          {isPlaying ? <Pause /> : <Play />}
        </button>
        <div className="seek-bar-container" onClick={handleSeek} role="slider" aria-valuemin="0" aria-valuemax={Math.floor(duration)} aria-valuenow={Math.floor(currentTime)} tabIndex={0}>
          <div className="seek-bar-track"><div className="seek-bar-fill" style={{ width: `${progress}%` }} /></div>
        </div>
        <div className="time-display">{formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}</div>
      </div>
    </div>
  );
}

export default function SeriesDetailView({
  menuProjectId,
  menuPosition,
  onBack,
  onDeleteProject,
  onEditProject,
  onEpisodeNumberChange,
  onMenuToggle,
  onOpenProject,
  onSelectEpisode,
  selectedEpisodeId,
  series,
}) {
  const [editingEpisodeId, setEditingEpisodeId] = useState('');
  const selectedProject = series.projects.find((project) => project.id === selectedEpisodeId) || series.projects[0];

  const handleEpisodeSave = (project, value) => {
    setEditingEpisodeId('');
    onEpisodeNumberChange(project, value);
  };

  return (
    <div className="dashboard series-detail-view dev-locator-host">
      <DeveloperLocator code={`dashboard.series.${series.id}.detail`} title="Series Detail View" />
      <div className="dashboard-header series-detail-header">
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}><ArrowLeft size={16} /> Back</button>
          <h1 className="dashboard-title gradient-text">{series.name}</h1>
          <p className="dashboard-subtitle">{series.projects.length} episodes</p>
        </div>
      </div>

      <div className="series-watch-layout">
        <section className="series-player-panel dev-locator-host">
          <DeveloperLocator code={`dashboard.series.${series.id}.player`} title="Series Player Panel" />
          <div className="series-video-frame">
            <SeriesVideoPlayer key={selectedProject?.id} project={selectedProject} />
          </div>
          <div className="series-player-meta">
            <div>
              <span>Episode {normalizeEpisodeNumber(selectedProject?.episode_number) || '-'}</span>
              <h2>{getProjectTitle(selectedProject)}</h2>
            </div>
            <button type="button" className="btn btn-primary btn-sm" disabled={!selectedProject} onClick={() => onOpenProject(selectedProject.id)}><ExternalLink size={16} /> Open project</button>
          </div>
        </section>

        <aside className="series-episode-panel dev-locator-host">
          <DeveloperLocator code={`dashboard.series.${series.id}.episodes`} title="Series Episode List" />
          {series.projects.map((project) => {
            const episodeNumber = normalizeEpisodeNumber(project.episode_number) || 1;
            const isSelected = project.id === selectedProject?.id;
            return (
              <article key={project.id} className={`series-episode-row dev-locator-host${isSelected ? ' active' : ''}`} onClick={() => onSelectEpisode(project.id)}>
                <DeveloperLocator code={`dashboard.series.${series.id}.episode.${project.id}`} title="Series Episode Row" />
                <button type="button" className="series-episode-thumb" onClick={() => onSelectEpisode(project.id)}>
                  {project.preview_url ? <video src={project.preview_url} muted preload="metadata" /> : <span />}
                </button>
                <div className="series-episode-main">
                  {editingEpisodeId === project.id ? (
                    <EpisodeNumberEditor initialValue={episodeNumber} onCancel={() => setEditingEpisodeId('')} onSave={(value) => handleEpisodeSave(project, value)} />
                  ) : (
                    <button type="button" className="series-episode-label" onDoubleClick={() => setEditingEpisodeId(project.id)}>Episode {episodeNumber}</button>
                  )}
                  <strong title={getProjectTitle(project)}>{getProjectTitle(project)}</strong>
                </div>
                <ProjectActionMenu
                  isOpen={menuProjectId === project.id}
                  menuPosition={menuProjectId === project.id ? menuPosition : null}
                  onDelete={(event) => onDeleteProject(event, project)}
                  onEdit={(event) => onEditProject(event, project)}
                  onToggle={(event) => onMenuToggle(event, project.id)}
                />
              </article>
            );
          })}
        </aside>
      </div>
    </div>
  );
}