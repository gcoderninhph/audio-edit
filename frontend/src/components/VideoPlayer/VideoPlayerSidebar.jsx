import { createPortal } from 'react-dom';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';

export default function VideoPlayerSidebar({ activeSection, title, onClose, children }) {
  if (!activeSection || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="video-player-sidebar-layer" onClick={onClose}>
      <div className="video-player-sidebar-backdrop" />
      <aside
        id="video-player-frame-sidebar"
        className="video-player-sidebar dev-locator-host"
        role="dialog"
        aria-labelledby="video-player-sidebar-title"
        onClick={(event) => event.stopPropagation()}
      >
        <DeveloperLocator code="panel.video-player.sidebar" title="Video Player Sidebar" />
        <div className="video-player-sidebar-head">
          <div>
            <span className="video-player-sidebar-kicker">Left sidebar</span>
            <h3 id="video-player-sidebar-title" className="video-player-sidebar-title">{title}</h3>
          </div>
        </div>
        {children}
      </aside>
    </div>,
    document.body,
  );
}
