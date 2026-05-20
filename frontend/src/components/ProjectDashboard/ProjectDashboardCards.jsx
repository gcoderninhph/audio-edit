import { MoreVertical, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useRef, useState } from 'react';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import { formatDate, getProjectTitle, normalizeEpisodeNumber } from './projectDashboardModel';

export function ProjectCardThumbnail({ previewUrl, title }) {
  const videoRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleLoadedMetadata = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    const previewTime = Math.min(0.05, Math.max(videoElement.duration || 0, 0));
    if (previewTime > 0) {
      videoElement.currentTime = previewTime;
      return;
    }
    setIsReady(true);
  };

  if (!previewUrl || hasError) {
    return <div className="project-card-thumb-fallback"><Play size={28} /></div>;
  }

  return (
    <>
      <video
        ref={videoRef}
        className={`project-card-video ${isReady ? 'ready' : ''}`}
        src={previewUrl}
        muted
        preload="metadata"
        playsInline
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={() => setIsReady(true)}
        onSeeked={() => setIsReady(true)}
        onError={() => setHasError(true)}
        aria-label={title}
      />
      {!isReady && <div className="project-card-thumb-fallback"><Play size={28} /></div>}
    </>
  );
}

export function ProjectActionMenu({ isOpen, menuPosition, onDelete, onEdit, onToggle }) {
  const menu = isOpen && menuPosition && typeof document !== 'undefined' ? createPortal(
    <div
      className="project-card-menu project-card-menu-floating"
      style={{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" onClick={onEdit}><Pencil size={15} /> Edit info</button>
      <button type="button" className="danger" onClick={onDelete}><Trash2 size={15} /> Delete video</button>
    </div>,
    document.body,
  ) : null;

  return (
    <div className={`project-card-menu-wrap${isOpen ? ' is-open' : ''}`}>
      <button type="button" className="project-card-menu-button" onClick={onToggle} aria-label="Video options" title="Options">
        <MoreVertical size={17} />
      </button>
      {menu}
    </div>
  );
}

export function NewProjectCard({ onClick }) {
  return (
    <button type="button" className="project-card project-card-new dev-locator-host" onClick={onClick}>
      <DeveloperLocator code="dashboard.project.new" title="New Project Card" />
      <Plus size={34} />
      <span>New</span>
    </button>
  );
}

export function ProjectCard({ isMenuOpen, menuPosition, onDelete, onEdit, onMenuToggle, onOpen, project }) {
  const title = getProjectTitle(project);
  return (
    <article className="project-card dev-locator-host" onClick={onOpen}>
      <DeveloperLocator code={`dashboard.project.${project.id}`} title="Saved Project Card" style={{ right: '42px' }} />
      <div className="project-card-thumb">
        <ProjectCardThumbnail previewUrl={project.preview_url} title={title} />
        <div className="project-card-play"><Play size={20} /></div>
      </div>
      <div className="project-card-info">
        <div className="project-card-name" title={title}>{title}</div>
        <div className="project-card-date">Created {formatDate(project.created_at || project.updated_at)}</div>
      </div>
      <ProjectActionMenu isOpen={isMenuOpen} menuPosition={menuPosition} onDelete={onDelete} onEdit={onEdit} onToggle={onMenuToggle} />
    </article>
  );
}

export function SeriesCard({ group, onOpen }) {
  const firstProject = group.projects[0];
  const lastEpisode = group.projects[group.projects.length - 1];
  return (
    <button type="button" className="series-card dev-locator-host" onClick={onOpen}>
      <DeveloperLocator code={`dashboard.series.${group.id}`} title="Dashboard Series Card" />
      <div className="series-card-thumb">
        <ProjectCardThumbnail previewUrl={firstProject?.preview_url} title={group.name} />
        <div className="series-card-count">{group.projects.length} episodes</div>
      </div>
      <div className="series-card-info">
        <strong>{group.name}</strong>
        <span>Episode {normalizeEpisodeNumber(lastEpisode?.episode_number) || group.projects.length}</span>
      </div>
    </button>
  );
}