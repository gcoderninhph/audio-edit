import DeveloperLocator from '../DeveloperLocator/DeveloperLocator'
import {
  EXPORT_QUALITY_PROFILE_OPTIONS,
  getExportQualityProfileById,
} from '../../utils/exportQualityProfile'
import { getExportDirectoryLabel, getExportFileNameLabel } from '../../utils/exportOutputTarget'
import { useI18n } from '../../i18n/useI18n'

export default function VideoPlayerExportControls({
  exportQualityProfileId,
  onExportQualityProfileChange,
  exportFileName,
  onExportFileNameChange,
  exportOutputDirectory,
  onChooseExportOutputDirectory,
}) {
  const { t } = useI18n()
  const activeExportQualityProfile = getExportQualityProfileById(exportQualityProfileId)
  const getProfileLabel = (profile) => (profile?.labelKey ? t(profile.labelKey) : profile?.label)
  const getProfileHelper = (profile) => (profile?.helperKey ? t(profile.helperKey) : profile?.helper)

  return (
    <section className="video-frame-section dev-locator-host">
      <DeveloperLocator code="panel.video-player.export-controls" title="Export Controls" />
      <div className="video-frame-section-head">
        <div>
          <span className="video-frame-section-label">{t('panel.videoPlayer.exportControls.exportTarget')}</span>
          <strong className="video-frame-section-value">{getExportFileNameLabel(exportFileName)} • {getProfileLabel(activeExportQualityProfile)}</strong>
        </div>
        <span className="video-frame-section-caption">{t('panel.videoPlayer.exportControls.exportTargetHint')}</span>
      </div>

      <div className="video-frame-detail-panel dev-locator-host">
        <DeveloperLocator code="panel.video-player.export-controls.quality" title="Export Quality Sidebar Control" />
        <div>
          <div className="video-frame-detail-title">{t('panel.videoPlayer.exportControls.videoQuality')}</div>
          <p className="video-frame-detail-copy">{t('panel.videoPlayer.exportControls.videoQualityHint')}</p>
        </div>
        <div className="video-frame-field-row">
          <label className="video-frame-field-label" htmlFor="video-export-quality-select">{t('panel.videoPlayer.exportControls.profile')}</label>
          <select
            id="video-export-quality-select"
            className="video-frame-field-select"
            value={activeExportQualityProfile.id}
            onChange={(event) => onExportQualityProfileChange?.(event.target.value)}
          >
            {EXPORT_QUALITY_PROFILE_OPTIONS.map((profile) => (
              <option key={profile.id} value={profile.id}>{getProfileLabel(profile)}</option>
            ))}
          </select>
        </div>
        <div className="video-frame-image-note">{getProfileHelper(activeExportQualityProfile)}</div>
      </div>

      <div className="video-frame-detail-panel dev-locator-host">
        <DeveloperLocator code="panel.video-player.export-controls.file-name" title="Export File Name Control" />
        <div>
          <div className="video-frame-detail-title">{t('panel.videoPlayer.exportControls.outputFileName')}</div>
          <p className="video-frame-detail-copy">{t('panel.videoPlayer.exportControls.outputFileNameHint')}</p>
        </div>
        <div className="video-frame-field-row">
          <label className="video-frame-field-label" htmlFor="video-export-file-name">{t('panel.videoPlayer.exportControls.fileName')}</label>
          <input
            id="video-export-file-name"
            className="video-frame-field-input"
            type="text"
            value={exportFileName}
            onChange={(event) => onExportFileNameChange?.(event.target.value)}
            placeholder={t('panel.videoPlayer.exportControls.fileNamePlaceholder')}
          />
        </div>
        <div className="video-frame-image-note">{t('panel.videoPlayer.exportControls.finalFile', { fileName: getExportFileNameLabel(exportFileName) })}</div>
      </div>

      <div className="video-frame-detail-panel dev-locator-host">
        <DeveloperLocator code="panel.video-player.export-controls.output-folder" title="Export Output Folder Control" />
        <div>
          <div className="video-frame-detail-title">{t('panel.videoPlayer.exportControls.outputFolder')}</div>
          <p className="video-frame-detail-copy">{t('panel.videoPlayer.exportControls.outputFolderHint')}</p>
        </div>
        <button
          type="button"
          className="video-frame-upload-btn"
          onClick={() => void onChooseExportOutputDirectory?.()}
        >
          {t('panel.videoPlayer.exportControls.chooseExportFolder')}
        </button>
        <div className="video-frame-image-note">{t('panel.videoPlayer.exportControls.currentFolder', { folder: getExportDirectoryLabel(exportOutputDirectory) })}</div>
      </div>
    </section>
  )
}