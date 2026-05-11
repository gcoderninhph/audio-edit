import {
  DEFAULT_SUBTITLE_SETTINGS,
  SUBTITLE_ANCHOR_OPTIONS,
  SUBTITLE_FONT_OPTIONS,
  getSubtitleAnchorOption,
  getSubtitleFontOption,
  normalizeSubtitleSettings,
} from '../../utils/subtitleRenderModel'
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator'
import './VideoPlayerSubtitleControls.css'

const SUBTITLE_ANCHOR_GRID_ROWS = [
  ['top-left', 'top-center', 'top-right'],
  ['middle-left', 'middle-center', 'middle-right'],
  ['bottom-left', 'bottom-center', 'bottom-right'],
]

function formatColorValue(hexColor) {
  return String(hexColor || '').toUpperCase()
}

export default function VideoPlayerSubtitleControls({
  subtitleSettings = DEFAULT_SUBTITLE_SETTINGS,
  onSubtitleSettingsChange,
}) {
  const normalizedSubtitleSettings = normalizeSubtitleSettings(subtitleSettings)
  const activeSubtitleAnchor = getSubtitleAnchorOption(normalizedSubtitleSettings.anchor)
  const activeSubtitleFont = getSubtitleFontOption(normalizedSubtitleSettings.fontFamily)
  const subtitleFontScalePercent = Math.round((normalizedSubtitleSettings.fontSizeScale || 1) * 100)
  const subtitleBackgroundOpacityPercent = Math.round((normalizedSubtitleSettings.backgroundOpacity || 0) * 100)

  const applySubtitleSettings = (partialSettings) => {
    onSubtitleSettingsChange?.({
      ...normalizedSubtitleSettings,
      ...partialSettings,
    })
  }

  return (
    <section className="video-frame-section dev-locator-host">
      <DeveloperLocator code="panel.video-player.subtitle-controls" title="Subtitle Controls" />
      <div className="video-frame-section-head">
        <div>
          <span className="video-frame-section-label">Subtitle</span>
          <strong className="video-frame-section-value">Co chu {subtitleFontScalePercent}% • {activeSubtitleFont.label} • Neo {activeSubtitleAnchor.label}</strong>
        </div>
        <span className="video-frame-section-caption">Muc nay dong bo cho preview canvas, overlay export native va renderer-record export.</span>
      </div>

      <div className="video-frame-detail-panel dev-locator-host">
        <DeveloperLocator code="panel.video-player.subtitle-controls.font-size" title="Subtitle Font Size Control" />
        <div>
          <div className="video-frame-detail-title">Kich thuoc font subtitle</div>
          <p className="video-frame-detail-copy">Tang hoac giam co chu subtitle de uu tien do doc ma van giu subtitle gon trong khung.</p>
        </div>
        <div className="video-frame-field-row">
          <label className="video-frame-field-label" htmlFor="subtitle-font-scale-range">Kich thuoc font</label>
          <div className="video-audio-slider-row">
            <input
              id="subtitle-font-scale-range"
              className="video-audio-slider"
              type="range"
              min="0.6"
              max="1.8"
              step="0.05"
              value={normalizedSubtitleSettings.fontSizeScale}
              onChange={(event) => applySubtitleSettings({
                fontSizeScale: parseFloat(event.target.value),
              })}
            />
            <span className="video-audio-slider-value">{subtitleFontScalePercent}%</span>
          </div>
        </div>
      </div>

      <div className="video-frame-detail-panel dev-locator-host">
        <DeveloperLocator code="panel.video-player.subtitle-controls.font-family" title="Subtitle Font Family Control" />
        <div>
          <div className="video-frame-detail-title">Kieu font</div>
          <p className="video-frame-detail-copy">Chon font subtitle phu hop voi chat giong va bo cuc video, dong bo cho preview va export.</p>
        </div>
        <div className="video-frame-field-row">
          <label className="video-frame-field-label" htmlFor="subtitle-font-family-select">Font subtitle</label>
          <select
            id="subtitle-font-family-select"
            className="video-frame-field-select"
            value={activeSubtitleFont.id}
            onChange={(event) => applySubtitleSettings({ fontFamily: event.target.value })}
          >
            {SUBTITLE_FONT_OPTIONS.map((fontOption) => (
              <option key={fontOption.id} value={fontOption.id}>{fontOption.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="video-frame-detail-panel dev-locator-host">
        <DeveloperLocator code="panel.video-player.subtitle-controls.appearance" title="Subtitle Appearance Controls" />
        <div>
          <div className="video-frame-detail-title">Mau subtitle</div>
          <p className="video-frame-detail-copy">Doi mau chu, mau nen va do dam nen subtitle de phu hop voi khung hinh dang dung.</p>
        </div>
        <div className="subtitle-style-grid">
          <div className="subtitle-style-field dev-locator-host">
            <DeveloperLocator code="panel.video-player.subtitle-controls.font-color" title="Subtitle Font Color Control" />
            <span className="video-frame-field-label">Mau chu</span>
            <label className="subtitle-color-control" htmlFor="subtitle-font-color-input">
              <input
                id="subtitle-font-color-input"
                className="subtitle-color-control-input"
                type="color"
                value={normalizedSubtitleSettings.fontColor}
                onChange={(event) => applySubtitleSettings({ fontColor: event.target.value })}
              />
              <span className="subtitle-color-control-value">{formatColorValue(normalizedSubtitleSettings.fontColor)}</span>
            </label>
          </div>

          <div className="subtitle-style-field dev-locator-host">
            <DeveloperLocator code="panel.video-player.subtitle-controls.background-color" title="Subtitle Background Color Control" />
            <span className="video-frame-field-label">Mau nen</span>
            <label className="subtitle-color-control" htmlFor="subtitle-background-color-input">
              <input
                id="subtitle-background-color-input"
                className="subtitle-color-control-input"
                type="color"
                value={normalizedSubtitleSettings.backgroundColor}
                onChange={(event) => applySubtitleSettings({ backgroundColor: event.target.value })}
              />
              <span className="subtitle-color-control-value">{formatColorValue(normalizedSubtitleSettings.backgroundColor)}</span>
            </label>
          </div>
        </div>
        <div className="subtitle-style-field dev-locator-host">
          <DeveloperLocator code="panel.video-player.subtitle-controls.background-opacity" title="Subtitle Background Opacity Control" />
          <label className="video-frame-field-label" htmlFor="subtitle-background-opacity-range">Do dam nen</label>
          <div className="video-audio-slider-row">
            <input
              id="subtitle-background-opacity-range"
              className="video-audio-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={normalizedSubtitleSettings.backgroundOpacity}
              onChange={(event) => applySubtitleSettings({
                backgroundOpacity: parseFloat(event.target.value),
              })}
            />
            <span className="video-audio-slider-value">{subtitleBackgroundOpacityPercent}%</span>
          </div>
        </div>
      </div>

      <div className="video-frame-detail-panel dev-locator-host">
        <DeveloperLocator code="panel.video-player.subtitle-controls.anchor" title="Subtitle Anchor Control" />
        <div>
          <div className="video-frame-detail-title">Diem neo subtitle</div>
          <p className="video-frame-detail-copy">Chon vi tri ma box subtitle bam vao trong khung, phu hop voi bo cuc va nhan vat trong video.</p>
        </div>
        <div className="video-frame-field-row">
          <span className="video-frame-field-label">Diem neo</span>
          <div className="subtitle-anchor-grid" role="grid" aria-label="Chon diem neo subtitle">
            {SUBTITLE_ANCHOR_GRID_ROWS.map((anchorRow, rowIndex) => (
              <div key={`subtitle-anchor-row-${rowIndex}`} className="subtitle-anchor-grid-row" role="row">
                {anchorRow.map((anchorId) => {
                  const anchorOption = SUBTITLE_ANCHOR_OPTIONS.find((option) => option.id === anchorId)
                  if (!anchorOption) {
                    return null
                  }

                  const isActive = anchorOption.id === activeSubtitleAnchor.id
                  return (
                    <button
                      key={anchorOption.id}
                      type="button"
                      className={`subtitle-anchor-btn ${isActive ? 'active' : ''}`}
                      onClick={() => applySubtitleSettings({ anchor: anchorOption.id })}
                      aria-pressed={isActive}
                      aria-label={anchorOption.label}
                      title={anchorOption.label}
                    >
                      <span className="subtitle-anchor-btn-dot" aria-hidden="true" />
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="video-frame-image-note">
          Subtitle hien dang neo tai <strong>{activeSubtitleAnchor.label}</strong> va se duoc luu trong project hien tai.
        </div>
      </div>
    </section>
  )
}