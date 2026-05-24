import { createPortal } from 'react-dom';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import { useI18n } from '../../i18n/useI18n';
import { EXPORT_QUALITY_PROFILE_OPTIONS, getExportQualityProfileById } from '../../utils/exportQualityProfile';
import { getExportDirectoryLabel, getExportFileNameLabel } from '../../utils/exportOutputTarget';

function formatFileSize(bytes) {
  if (!bytes || bytes < 1024) return (bytes || 0) + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function SeriesExportModal({
  series,
  qualityProfileId,
  onQualityProfileChange,
  outputFileName,
  onOutputFileNameChange,
  outputDirectory,
  onChooseDirectory,
  isExporting,
  exportProgress,
  exportResult,
  onExport,
  onClose,
}) {
  const { t } = useI18n();
  const episodeCount = series?.projects?.length || 0;
  const activeProfile = getExportQualityProfileById(qualityProfileId);
  const canExport = episodeCount > 0 && !isExporting;

  const phaseLabels = {
    idle: '',
    episode: t('dashboard.exportSeriesModal.phase.episode'),
    concat: t('dashboard.exportSeriesModal.phase.concat'),
    saving: t('dashboard.exportSeriesModal.phase.saving'),
    done: t('dashboard.exportSeriesModal.phase.done'),
    error: t('dashboard.exportSeriesModal.phase.error'),
  };

  const handleReveal = () => {
    if (!exportResult?.savedFilePath) return;
    void window.desktopBridge?.exportOutput?.revealFile?.(exportResult.savedFilePath);
  };

  return createPortal(
    <div
      className="export-modal-layer"
      onClick={() => { if (!isExporting) onClose(); }}
    >
      <div
        className="export-modal-dialog dev-locator-host"
        role="dialog"
        aria-modal="true"
        aria-labelledby="series-export-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <DeveloperLocator code={`dashboard.series.${series?.id}.export.modal`} title="Series Export Modal" />
        <div className="export-modal-head">
          <h2 className="export-modal-title" id="series-export-modal-title">
            {t('dashboard.exportSeriesModal.title')}
          </h2>
          <button
            type="button"
            className="export-modal-close-btn"
            onClick={onClose}
            disabled={isExporting}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="export-modal-body">
          <div className="export-panel">
            {/* Summary */}
            <div className="export-panel-header">
              <div>
                <div className="export-panel-title">{series?.name || ''}</div>
                <div className="export-panel-info">
                  {t('dashboard.exportSeriesModal.episodeSummary', { count: episodeCount })}
                </div>
                <div className="export-frame-info">
                  {t('dashboard.exportSeriesModal.skippedHint')}
                </div>
              </div>
            </div>

            {/* Config */}
            {!isExporting && exportProgress.phase === 'idle' && !exportResult && (
              <div className="series-export-config">
                <div className="series-export-config-row">
                  <label className="series-export-label">
                    {t('dashboard.exportSeriesModal.videoQuality')}
                  </label>
                  <select
                    className="series-export-select"
                    value={qualityProfileId}
                    onChange={(e) => onQualityProfileChange(e.target.value)}
                  >
                    {EXPORT_QUALITY_PROFILE_OPTIONS.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.labelKey ? t(profile.labelKey) : profile.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="series-export-config-row">
                  <label className="series-export-label">
                    {t('dashboard.exportSeriesModal.outputFileName')}
                  </label>
                  <input
                    type="text"
                    className="series-export-input"
                    value={outputFileName}
                    placeholder={t('dashboard.exportSeriesModal.outputFileNamePlaceholder')}
                    onChange={(e) => onOutputFileNameChange(e.target.value)}
                  />
                </div>

                <div className="series-export-config-row">
                  <label className="series-export-label">
                    {t('dashboard.exportSeriesModal.outputFolder')}
                  </label>
                  <div className="series-export-folder-row">
                    <span className="series-export-folder-label">
                      {t('dashboard.exportSeriesModal.currentFolder', { folder: getExportDirectoryLabel(outputDirectory) })}
                    </span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={onChooseDirectory}>
                      {t('dashboard.exportSeriesModal.chooseFolder')}
                    </button>
                  </div>
                </div>

                <div className="export-quality-helper">
                  {activeProfile?.helperKey ? t(activeProfile.helperKey) : activeProfile?.helper}
                  &nbsp;• {t('panel.export.fileSizeProfile', {
                    profile: activeProfile?.labelKey ? t(activeProfile.labelKey) : activeProfile?.label,
                    fileName: getExportFileNameLabel(outputFileName || 'series_output'),
                    folder: getExportDirectoryLabel(outputDirectory),
                  })}
                </div>
              </div>
            )}

            {/* Export button */}
            {!exportResult && (
              <div className="export-actions" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-primary export-btn"
                  onClick={onExport}
                  disabled={!canExport}
                >
                  {isExporting
                    ? t('dashboard.exportSeriesModal.processingButton')
                    : t('dashboard.exportSeriesModal.exportButton')}
                </button>
              </div>
            )}

            {/* Progress */}
            {(isExporting || (exportProgress.phase !== 'idle' && exportProgress.phase !== 'done' && exportProgress.phase !== 'error')) && (
              <div className="export-progress" style={{ marginTop: 16 }}>
                <div className="export-progress-phase">
                  {phaseLabels[exportProgress.phase] || exportProgress.phase}
                </div>
                {exportProgress.episodeTotal > 0 && exportProgress.phase === 'episode' && (
                  <div className="export-progress-detail" style={{ marginTop: 4 }}>
                    {t('dashboard.exportSeriesModal.episodeProgress', {
                      current: (exportProgress.episodeIndex || 0) + 1,
                      total: exportProgress.episodeTotal,
                    })}
                  </div>
                )}
                <div className="export-progress-meta" style={{ marginTop: 4 }}>
                  <span><strong>{exportProgress.percent || 0}%</strong></span>
                  {exportProgress.detail && <span>{exportProgress.detail}</span>}
                </div>
                <div className="progress-bar" style={{ marginTop: 8 }}>
                  <div className="progress-bar-fill" style={{ width: `${exportProgress.percent || 0}%` }} />
                </div>
              </div>
            )}

            {/* Log */}
            {exportProgress.logs?.length > 0 && (
              <div className="export-log-panel" style={{ marginTop: 16 }}>
                <div className="export-log-header">
                  <span>{t('panel.export.logTitle')}</span>
                </div>
                <div className="export-log-list">
                  {exportProgress.logs.map((log, index) => (
                    <div key={`${log.timestamp}-${index}`} className={`export-log-entry ${log.level || 'info'}`}>
                      <span className="export-log-phase">[{log.phase}]</span>
                      <span className="export-log-message">{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Result */}
            {exportResult && !isExporting && (
              <div className="export-result" style={{ marginTop: 16 }}>
                <div className="export-result-info">
                  <div className="export-result-icon">✅</div>
                  <div>
                    <div className="export-result-text">{t('panel.export.videoWrittenLocal')}</div>
                    <div className="export-result-size">{formatFileSize(exportResult.size)}</div>
                    {exportResult.savedFilePath && (
                      <div className="export-result-size export-result-path">{exportResult.savedFilePath}</div>
                    )}
                    {exportResult.skippedEpisodes?.length > 0 && (
                      <div className="export-result-size" style={{ color: 'var(--color-warning)' }}>
                        Episodes skipped: {exportResult.skippedEpisodes.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
                <div className="export-result-actions">
                  {exportResult.savedFilePath && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={handleReveal}>
                      {t('panel.export.showFile')}
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
