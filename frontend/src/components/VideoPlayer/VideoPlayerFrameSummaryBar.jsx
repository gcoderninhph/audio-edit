import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';

const FRAME_SIDEBAR_SECTIONS = Object.freeze({
  FRAME: 'frame',
  BACKGROUND: 'background',
});

export default function VideoPlayerFrameSummaryBar({
  activeSection,
  framePresetLabel,
  frameBackgroundLabel,
  onToggleSection,
}) {
  return (
    <div className="video-player-summary-bar dev-locator-host">
      <DeveloperLocator code="panel.video-player.frame-summary" title="Frame Summary Bar" />
      <div className="video-player-summary-actions">
        <button
          type="button"
          className={`video-player-summary-toggle ${activeSection === FRAME_SIDEBAR_SECTIONS.FRAME ? 'is-active' : ''}`}
          onClick={() => onToggleSection(FRAME_SIDEBAR_SECTIONS.FRAME)}
          aria-controls="video-player-frame-sidebar"
          aria-expanded={activeSection === FRAME_SIDEBAR_SECTIONS.FRAME}
        >
          <span className="video-player-summary-toggle-label">Khung</span>
          <span className="video-player-summary-toggle-value">{framePresetLabel}</span>
        </button>
        <button
          type="button"
          className={`video-player-summary-toggle ${activeSection === FRAME_SIDEBAR_SECTIONS.BACKGROUND ? 'is-active' : ''}`}
          onClick={() => onToggleSection(FRAME_SIDEBAR_SECTIONS.BACKGROUND)}
          aria-controls="video-player-frame-sidebar"
          aria-expanded={activeSection === FRAME_SIDEBAR_SECTIONS.BACKGROUND}
        >
          <span className="video-player-summary-toggle-label">Nền</span>
          <span className="video-player-summary-toggle-value">{frameBackgroundLabel}</span>
        </button>
      </div>
    </div>
  );
}