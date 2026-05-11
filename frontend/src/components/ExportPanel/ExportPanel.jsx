import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import {
  getExportQualityProfileById,
} from '../../utils/exportQualityProfile';
import {
  getExportDirectoryLabel,
  getExportFileNameLabel,
} from '../../utils/exportOutputTarget';
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
  saving: '💾 Writing output file...',
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
  exportResult,
  videoName,
  frameSummary,
  frameBackgroundLabel,
  exportConfig,
  onOpenExportConfig,
  onExport,
}) {
  const hasScenes = scenes && scenes.length > 0;
  const hasDeletedScenes = deletedSceneIds && deletedSceneIds.size > 0;
  const canExport = keptScenes.length > 0 || duration > 0;
  const exportUrl = exportResult?.url || null;
  const exportSavedFilePath = exportResult?.savedFilePath || '';
  const exportSize = exportResult?.size || 0;
  const activeExportQualityProfile = getExportQualityProfileById(exportConfig?.qualityProfileId);

  const handleExport = () => {
    if (canExport) onExport();
  };

  const handleDownload = () => {
    if (!exportUrl) return;
    const a = document.createElement('a');
    a.href = exportUrl;
    a.download = getExportFileNameLabel(exportConfig?.fileName || videoName || 'output');
    a.click();
  };

  const handleRevealSavedFile = () => {
    void exportResult?.revealSavedFile?.();
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
          <div className="export-quality-control dev-locator-host">
            <DeveloperLocator code="panel.export.quality" title="Export Quality Control" />
            <div className="export-quality-summary">
              <span className="export-quality-label">Export config</span>
              <strong className="export-quality-value">{activeExportQualityProfile.label}</strong>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm export-config-btn"
              onClick={onOpenExportConfig}
              disabled={isExporting}
            >
              ⚙️ Config
            </button>
          </div>
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

      <div className="export-quality-helper">
        File size profile: <strong>{activeExportQualityProfile.label}</strong> • File: <strong>{getExportFileNameLabel(exportConfig?.fileName)}</strong> • Folder: <strong>{getExportDirectoryLabel(exportConfig?.outputDirectory)}</strong>
      </div>

      <div className="export-target-helper">
        {activeExportQualityProfile.helper}
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
      {(exportUrl || exportSavedFilePath) && !isExporting && (
        <div className="export-result">
          <div className="export-result-info">
            <div className="export-result-icon">✅</div>
            <div>
              <div className="export-result-text">{exportSavedFilePath ? 'Your video was written to the local export folder!' : 'Your video is ready!'}</div>
              <div className="export-result-size">{formatFileSize(exportSize)}</div>
              {exportSavedFilePath && (
                <div className="export-result-size export-result-path">{exportSavedFilePath}</div>
              )}
            </div>
          </div>
          {exportSavedFilePath ? (
            <button className="download-btn" onClick={handleRevealSavedFile} id="download-btn">
              📂 Show File
            </button>
          ) : (
            <button className="download-btn" onClick={handleDownload} id="download-btn">
              📥 Download
            </button>
          )}
        </div>
      )}
    </div>
  );
}
