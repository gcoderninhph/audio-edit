import { useState, useCallback } from 'react';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import './ExportPanel.css';

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatElapsedTime(milliseconds) {
  if (!milliseconds || milliseconds <= 0) return '00:00';
  return formatTime(milliseconds / 1000);
}

const PHASE_LABELS = {
  loading: '⏳ Loading video processing engine...',
  preparing: '📦 Preparing files...',
  cutting: '✂️ Cutting scenes...',
  merging: '🔗 Merging video...',
  framing: '🖼️ Rendering frame and subtitles...',
  reading: '📖 Reading result...',
  done: '✅ Complete!',
  error: '❌ Export failed',
};

export default function ExportPanel({
  scenes,
  keptScenes,
  keptDuration,
  deletedSceneIds,
  duration = 0,
  isExporting,
  exportProgress,
  exportUrl,
  exportSize,
  videoName,
  frameSummary,
  frameBackgroundLabel,
  onExport,
  onLoadHistoryList,
  onLoadSession,
  onDeleteSession,
  historyList,
}) {
  const [showHistory, setShowHistory] = useState(false);

  const hasScenes = scenes && scenes.length > 0;
  const hasDeletedScenes = deletedSceneIds && deletedSceneIds.size > 0;
  const canExport = keptScenes.length > 0 || duration > 0;

  const handleExport = () => {
    if (canExport) onExport();
  };

  const handleToggleHistory = useCallback(async () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next) {
      await onLoadHistoryList();
    }
  }, [showHistory, onLoadHistoryList]);

  const handleDownload = () => {
    if (!exportUrl) return;
    const a = document.createElement('a');
    a.href = exportUrl;
    const baseName = videoName ? videoName.replace(/\.[^.]+$/, '') : 'output';
    a.download = `${baseName}_edited.mp4`;
    a.click();
  };

  return (
    <div className="export-panel dev-locator-host" id="export-panel">
      <DeveloperLocator code="panel.export.content" title="Export Panel" />
      <div className="export-panel-header">
        <div>
          <div className="export-panel-title">Export Video</div>
          {hasScenes ? (
            <div className="export-panel-info">
              {keptScenes.length}/{scenes.length} scenes • {formatTime(keptDuration)}
              {hasDeletedScenes && ` • ${deletedSceneIds.size} deleted`}
            </div>
          ) : (
            <div className="export-panel-info">
              {duration > 0 ? `Full video • ${formatTime(duration)} • no scene cuts yet` : 'Loading video duration...'}
            </div>
          )}
          <div className="export-frame-info">
            Export frame: <strong>{frameSummary}</strong> • Cover background: <strong>{frameBackgroundLabel}</strong>
          </div>
        </div>
        <div className="export-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleToggleHistory}
            title="View saved sessions"
          >
            📋 History
          </button>
          <button
            className="btn btn-primary export-btn"
            onClick={handleExport}
            disabled={!canExport || isExporting}
            id="export-btn"
          >
            {isExporting ? '⏳ Processing...' : '🎬 Export Video'}
          </button>
        </div>
      </div>

      {/* Export Progress */}
      {isExporting && (
        <div className="export-progress">
          <div className="export-progress-phase">
            {PHASE_LABELS[exportProgress.phase] || exportProgress.phase}
          </div>
          <div className="export-progress-meta">
            <span><strong>{Math.round(exportProgress.percent || 0)}%</strong> tổng</span>
            <span>{Math.round(exportProgress.stagePercent || 0)}% stage</span>
            <span>{formatElapsedTime(exportProgress.elapsedMs)}</span>
            {exportProgress.ffmpegTimeMicroseconds > 0 && (
              <span>FFmpeg {formatElapsedTime(exportProgress.ffmpegTimeMicroseconds / 1000)}</span>
            )}
          </div>
          {exportProgress.detail && (
            <div className="export-progress-detail">{exportProgress.detail}</div>
          )}
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${exportProgress.percent}%` }} />
          </div>
        </div>
      )}

      {exportProgress.logs?.length > 0 && (
        <div className="export-log-panel">
          <div className="export-log-header">
              <span>Export log</span>
              <span>{exportProgress.sceneCount || 0} scenes • {exportProgress.subtitleCount || 0} subtitles</span>
          </div>
          <div className="export-log-list">
            {exportProgress.logs.map((log, index) => (
              <div key={`${log.timestamp}-${index}`} className={`export-log-entry ${log.level || 'info'}`}>
                <span className="export-log-phase">[{log.phase || 'log'}]</span>
                <span className="export-log-message">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export Result */}
      {exportUrl && !isExporting && (
        <div className="export-result">
          <div className="export-result-info">
            <div className="export-result-icon">✅</div>
            <div>
              <div className="export-result-text">Your video is ready!</div>
              <div className="export-result-size">{formatFileSize(exportSize)}</div>
            </div>
          </div>
          <button className="download-btn" onClick={handleDownload} id="download-btn">
            📥 Download
          </button>
        </div>
      )}

      {/* History (sessions) */}
      {showHistory && (
        <div className="history-section">
          <div className="history-title">
            <span>📋 Saved sessions</span>
            <button className="btn btn-ghost btn-sm" onClick={onLoadHistoryList}>🔄</button>
          </div>
          {historyList && historyList.length > 0 ? (
            <div className="history-list">
              {historyList.map((item) => (
                <div key={item.id} className="history-item dev-locator-host">
                  <DeveloperLocator code={`history.item.${item.id}`} title="History Item" />
                  <div onClick={() => onLoadSession(item.id)} style={{ flex: 1, cursor: 'pointer' }}>
                    <div className="history-item-name">{item.video_original_name || 'Untitled'}</div>
                    <div className="history-item-date">
                      {item.updated_at ? new Date(item.updated_at).toLocaleString('en-US') : ''}
                    </div>
                  </div>
                  <div className="history-item-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => onLoadSession(item.id)}
                      title="Load session"
                    >
                      📂
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => onDeleteSession(item.id)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
              No saved sessions yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}
