import {
  DEFAULT_SUBTITLE_SETTINGS,
  SUBTITLE_ANCHOR_OPTIONS,
  SUBTITLE_FONT_OPTIONS,
  getSubtitleAnchorOption,
  getSubtitleFontOption,
  normalizeSubtitleSettings,
} from '../../utils/subtitleRenderModel'
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator'
import { useI18n } from '../../i18n/useI18n'
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
  const { t } = useI18n()
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
          <span className="video-frame-section-label">{t('panel.videoPlayer.subtitleControls.subtitle')}</span>
          <strong className="video-frame-section-value">{activeSubtitleFont.label} • {subtitleFontScalePercent}% • {activeSubtitleAnchor.label}</strong>
        </div>
      </div>

      <div className="video-frame-detail-panel dev-locator-host">
        <DeveloperLocator code="panel.video-player.subtitle-controls.font" title="Subtitle Font Controls" />
        <div className="video-frame-detail-title">{t('panel.videoPlayer.subtitleControls.font')}</div>
        <div className="video-frame-field-row">
          <label className="video-frame-field-label" htmlFor="subtitle-font-scale-range">{t('panel.videoPlayer.subtitleControls.size')}</label>
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
        <div className="video-frame-field-row">
          <label className="video-frame-field-label" htmlFor="subtitle-font-family-select">{t('panel.videoPlayer.subtitleControls.font')}</label>
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
        <div className="video-frame-field-row">
          <label className="video-frame-field-label" htmlFor="subtitle-font-color-input">{t('panel.videoPlayer.subtitleControls.color')}</label>
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
      </div>

      <div className="video-frame-detail-panel dev-locator-host">
        <DeveloperLocator code="panel.video-player.subtitle-controls.background" title="Subtitle Background Controls" />
        <div className="video-frame-detail-title">{t('panel.videoPlayer.subtitleControls.textBackground')}</div>
        <div className="video-frame-field-row">
          <label className="video-frame-field-label" htmlFor="subtitle-background-color-input">{t('panel.videoPlayer.subtitleControls.color')}</label>
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
        <div className="video-frame-field-row">
          <label className="video-frame-field-label" htmlFor="subtitle-background-opacity-range">{t('panel.videoPlayer.subtitleControls.opacity')}</label>
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
        <div className="video-frame-field-row">
          <span className="video-frame-field-label">{t('panel.videoPlayer.subtitleControls.anchor')}</span>
          <div className="subtitle-anchor-grid" role="grid" aria-label={t('panel.videoPlayer.subtitleControls.chooseAnchorPoint')}>
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
      </div>
    </section>
  )
}