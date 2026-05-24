import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import {
  getExportQualityProfileById,
} from '../../utils/exportQualityProfile';
import {
  getExportDirectoryLabel,
  getExportFileNameLabel,
} from '../../utils/exportOutputTarget';
import { useI18n } from '../../i18n/useI18n';
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
  const { t } = useI18n();
  const hasScenes = scenes && scenes.length > 0;
  const hasDeletedScenes = deletedSceneIds && deletedSceneIds.size > 0;
  const canExport = keptScenes.length > 0 || duration > 0;
  const exportUrl = exportResult?.url || null;
  const exportSavedFilePath = exportResult?.savedFilePath || '';
  const exportSize = exportResult?.size || 0;
  const activeExportQualityProfile = getExportQualityProfileById(exportConfig?.qualityProfileId);
  const getProfileLabel = (profile) => (profile?.labelKey ? t(profile.labelKey) : profile?.label);
  const getProfileHelper = (profile) => (profile?.helperKey ? t(profile.helperKey) : profile?.helper);
  const phaseLabels = {
    loading: t('panel.export.phase.loading'),
    preparing: t('panel.export.phase.preparing'),
    cutting: t('panel.export.phase.cutting'),
    merging: t('panel.export.phase.merging'),
    framing: t('panel.export.phase.framing'),
    reading: t('panel.export.phase.reading'),
    saving: t('panel.export.phase.saving'),
    done: t('panel.export.phase.done'),
    error: t('panel.export.phase.error'),
  };

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
          <div className="export-panel-title">{t('panel.export.title')}</div>
          {hasScenes ? (
            <div className="export-panel-info">
              {t('panel.export.scenesSummary', {
                kept: keptScenes.length,
                total: scenes.length,
                duration: formatTime(keptDuration),
              })}
              {hasDeletedScenes && ` • ${t('panel.export.deletedSummary', { count: deletedSceneIds.size })}`}
            </div>
          ) : (
            <div className="export-panel-info">
              {duration > 0
                ? t('panel.export.fullVideoSummary', { duration: formatTime(duration) })
                : t('panel.export.loadingDuration')}
            </div>
          )}
          <div className="export-frame-info">
            {t('panel.export.frameInfo', { frame: frameSummary, background: frameBackgroundLabel })}
          </div>
        </div>
        <div className="export-actions">
          <div className="export-quality-control dev-locator-host">
            <DeveloperLocator code="panel.export.quality" title="Export Quality Control" />
            <div className="export-quality-summary">
              <span className="export-quality-label">{t('panel.export.exportConfig')}</span>
              <strong className="export-quality-value">{getProfileLabel(activeExportQualityProfile)}</strong>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm export-config-btn"
              onClick={onOpenExportConfig}
              disabled={isExporting}
            >
              {t('panel.export.configButton')}
            </button>
          </div>
          <button
            className="btn btn-primary export-btn"
            onClick={handleExport}
            disabled={!canExport || isExporting}
            id="export-btn"
          >
            {isExporting ? t('panel.export.processingButton') : t('panel.export.exportButton')}
          </button>
        </div>
      </div>

      <div className="export-quality-helper">
        {t('panel.export.fileSizeProfile', {
          profile: getProfileLabel(activeExportQualityProfile),
          fileName: getExportFileNameLabel(exportConfig?.fileName),
          folder: getExportDirectoryLabel(exportConfig?.outputDirectory),
        })}
      </div>

      <div className="export-target-helper">
        {getProfileHelper(activeExportQualityProfile)}
      </div>

      {/* Export Progress */}
      {isExporting && (
        <div className="export-progress">
          <div className="export-progress-phase">
            {phaseLabels[exportProgress.phase] || exportProgress.phase}
          </div>
          <div className="export-progress-meta">
            <span><strong>{t('panel.export.progressTotal', { percent: Math.round(exportProgress.percent || 0) })}</strong></span>
            <span>{t('panel.export.progressStage', { percent: Math.round(exportProgress.stagePercent || 0) })}</span>
            <span>{formatElapsedTime(exportProgress.elapsedMs)}</span>
            {exportProgress.ffmpegTimeMicroseconds > 0 && (
              <span>{t('panel.export.ffmpegTime', { time: formatElapsedTime(exportProgress.ffmpegTimeMicroseconds / 1000) })}</span>
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
              <span>{t('panel.export.logTitle')}</span>
              <span>{t('panel.export.logSummary', { scenes: exportProgress.sceneCount || 0, subtitles: exportProgress.subtitleCount || 0 })}</span>
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
              <div className="export-result-text">{exportSavedFilePath ? t('panel.export.videoWrittenLocal') : t('panel.export.yourVideoReady')}</div>
              <div className="export-result-size">{formatFileSize(exportSize)}</div>
              {exportSavedFilePath && (
                <div className="export-result-size export-result-path">{exportSavedFilePath}</div>
              )}
            </div>
          </div>
          {exportSavedFilePath ? (
            <button className="download-btn" onClick={handleRevealSavedFile} id="download-btn">
              {t('panel.export.showFile')}
            </button>
          ) : (
            <button className="download-btn" onClick={handleDownload} id="download-btn">
              {t('panel.export.download')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
