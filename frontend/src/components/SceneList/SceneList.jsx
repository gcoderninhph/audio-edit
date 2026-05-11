import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import './SceneList.css';

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function SceneList({
  scenes,
  thumbnails,
  currentScene,
  isDetecting,
  detectProgress,
  keptScenes,
  keptDuration,
  onToggleDelete,
  onRestoreAll,
  onDeleteAll,
  onSeekToScene,
  onStartDetection,
  sensitivity,
  onSensitivityChange,
  videoFile,
}) {

  // Detection in progress
  if (isDetecting) {
    return (
      <div className="scene-list-container dev-locator-host">
        <DeveloperLocator code="panel.scene-list.detecting" title="Scene List Detecting State" />
        <div className="detecting-container">
          <div className="detecting-spinner" />
          <div className="detecting-text">Analyzing video...</div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${detectProgress}%` }} />
          </div>
          <div className="detecting-progress-text">{detectProgress}%</div>
        </div>
      </div>
    );
  }

  // No video loaded yet
  if (!videoFile) {
    return (
      <div className="scene-list-container dev-locator-host">
        <DeveloperLocator code="panel.scene-list.empty-video" title="Scene List Empty State" />
        <div className="scene-list-empty">
          📹 Upload a video to get started
        </div>
      </div>
    );
  }

  // Video loaded but no scenes detected yet
  if (scenes.length === 0) {
    return (
      <div className="scene-list-container dev-locator-host">
        <DeveloperLocator code="panel.scene-list.setup" title="Scene List Setup State" />
        <div className="detecting-container">
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Scene detection sensitivity: {sensitivity.toFixed(1)}
            </label>
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.1"
              value={sensitivity}
              onChange={(e) => onSensitivityChange(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-purple)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
              <span>More cuts</span>
              <span>Fewer cuts</span>
            </div>
          </div>
          <button className="btn btn-primary" onClick={onStartDetection} id="detect-scenes-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            Detect scenes automatically
          </button>
        </div>
      </div>
    );
  }

  // Scenes detected
  return (
    <div className="scene-list-container dev-locator-host" id="scene-list">
      <DeveloperLocator code="panel.scene-list" title="Scene List Panel" />
      <div className="scene-list-header">
        <div>
          <div className="scene-list-title">Scene list</div>
          <div className="scene-list-stats">
            Keeping <strong>{keptScenes.length}/{scenes.length}</strong> scenes
            {' '}• Duration: <strong>{formatTime(keptDuration)}</strong>
          </div>
        </div>
        <div className="scene-list-actions">
          <button className="btn btn-ghost btn-sm" onClick={onRestoreAll} title="Restore all scenes">
            ↩ Restore all
          </button>
          <button className="btn btn-danger btn-sm" onClick={onDeleteAll} title="Delete all scenes">
            🗑️ Delete all
          </button>
        </div>
      </div>

      {/* Sensitivity slider */}
      <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
        <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Sensitivity: {sensitivity.toFixed(1)}
          <input
            type="range"
            min="0.5"
            max="5"
            step="0.1"
            value={sensitivity}
            onChange={(e) => onSensitivityChange(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--accent-purple)' }}
          />
          <button className="btn btn-primary btn-sm" onClick={onStartDetection} style={{ fontSize: '0.65rem', padding: '4px 10px' }}>
            Re-detect
          </button>
        </label>
      </div>

      <div className="scene-list-scroll">
        {keptScenes.map((scene, index) => {
          const isActive = currentScene?.id === scene.id;
          const thumb = thumbnails[scene.id];

          return (
            <div
              key={scene.id}
              className={`scene-card dev-locator-host ${isActive ? 'active' : ''}`}
              style={{ animationDelay: `${index * 0.03}s` }}
              id={`scene-card-${scene.id}`}
            >
              <DeveloperLocator code={`scene.card.${scene.id}`} title="Scene Card" />
              <div className="scene-thumbnail" onClick={() => onSeekToScene(scene)}>
                {thumb ? (
                  <img src={thumb} alt={`Scene ${index + 1}`} />
                ) : (
                  <div className="scene-thumbnail-placeholder">🎬</div>
                )}
                <div className="scene-number-badge">{index + 1}</div>
              </div>

              <div className="scene-info" onClick={() => onSeekToScene(scene)}>
                <div className="scene-time-range">
                  {formatTime(scene.start)} — {formatTime(scene.end)}
                </div>
                <div className="scene-duration">
                  {scene.duration.toFixed(1)}s
                </div>
              </div>

              <div className="scene-actions">
                <button
                  className="scene-btn scene-btn-play"
                  onClick={(e) => { e.stopPropagation(); onSeekToScene(scene); }}
                  title="Play this scene"
                >
                  ▶
                </button>
                <button
                  className="scene-btn scene-btn-delete"
                  onClick={(e) => { e.stopPropagation(); onToggleDelete(scene.id); }}
                  title="Delete scene"
                >
                  🗑️
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
