import DeveloperLocator from '../DeveloperLocator/DeveloperLocator'
import {
  EXPORT_QUALITY_PROFILE_OPTIONS,
  getExportQualityProfileById,
} from '../../utils/exportQualityProfile'
import { getExportDirectoryLabel, getExportFileNameLabel } from '../../utils/exportOutputTarget'

export default function VideoPlayerExportControls({
  exportQualityProfileId,
  onExportQualityProfileChange,
  exportFileName,
  onExportFileNameChange,
  exportOutputDirectory,
  onChooseExportOutputDirectory,
}) {
  const activeExportQualityProfile = getExportQualityProfileById(exportQualityProfileId)

  return (
    <section className="video-frame-section dev-locator-host">
      <DeveloperLocator code="panel.video-player.export-controls" title="Export Controls" />
      <div className="video-frame-section-head">
        <div>
          <span className="video-frame-section-label">Export target</span>
          <strong className="video-frame-section-value">{getExportFileNameLabel(exportFileName)} • {activeExportQualityProfile.label}</strong>
        </div>
        <span className="video-frame-section-caption">The desktop build writes native exports directly to this local output path instead of waiting until the end to create the final file in memory.</span>
      </div>

      <div className="video-frame-detail-panel dev-locator-host">
        <DeveloperLocator code="panel.video-player.export-controls.quality" title="Export Quality Sidebar Control" />
        <div>
          <div className="video-frame-detail-title">Video quality</div>
          <p className="video-frame-detail-copy">Lower profiles compress more aggressively to reduce output size. The lowest profile is intended for draft exports and tiny files.</p>
        </div>
        <div className="video-frame-field-row">
          <label className="video-frame-field-label" htmlFor="video-export-quality-select">Profile</label>
          <select
            id="video-export-quality-select"
            className="video-frame-field-select"
            value={activeExportQualityProfile.id}
            onChange={(event) => onExportQualityProfileChange?.(event.target.value)}
          >
            {EXPORT_QUALITY_PROFILE_OPTIONS.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label}</option>
            ))}
          </select>
        </div>
        <div className="video-frame-image-note">{activeExportQualityProfile.helper}</div>
      </div>

      <div className="video-frame-detail-panel dev-locator-host">
        <DeveloperLocator code="panel.video-player.export-controls.file-name" title="Export File Name Control" />
        <div>
          <div className="video-frame-detail-title">Output file name</div>
          <p className="video-frame-detail-copy">Change the exported MP4 name before each render. The app always writes an `.mp4` file.</p>
        </div>
        <div className="video-frame-field-row">
          <label className="video-frame-field-label" htmlFor="video-export-file-name">File name</label>
          <input
            id="video-export-file-name"
            className="video-frame-field-input"
            type="text"
            value={exportFileName}
            onChange={(event) => onExportFileNameChange?.(event.target.value)}
            placeholder="video_edited"
          />
        </div>
        <div className="video-frame-image-note">Final file: <strong>{getExportFileNameLabel(exportFileName)}</strong></div>
      </div>

      <div className="video-frame-detail-panel dev-locator-host">
        <DeveloperLocator code="panel.video-player.export-controls.output-folder" title="Export Output Folder Control" />
        <div>
          <div className="video-frame-detail-title">Output folder</div>
          <p className="video-frame-detail-copy">Choose where the desktop export should write the MP4 while the render is running.</p>
        </div>
        <button
          type="button"
          className="video-frame-upload-btn"
          onClick={() => void onChooseExportOutputDirectory?.()}
        >
          Choose export folder
        </button>
        <div className="video-frame-image-note">Current folder: <strong>{getExportDirectoryLabel(exportOutputDirectory)}</strong></div>
      </div>
    </section>
  )
}