import { useCallback, useRef } from 'react'
import {
  DEFAULT_FRAME_BACKGROUND,
  FRAME_BACKGROUND_OPTIONS,
  FRAME_PRESETS,
  VIDEO_FADE_PRESET_OPTIONS,
  createVideoFadeFrameBackground,
  getFrameBackgroundLabel,
  getFramePresetById,
  getVideoFadePresetById,
  isImageFrameBackground,
  isVideoFadeFrameBackground,
} from '../../utils/frameComposer'
import {
  DEFAULT_SUBTITLE_SETTINGS,
  normalizeSubtitleSettings,
} from '../../utils/subtitleRenderModel'
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator'
import SceneBulkMotionConfig from '../SceneList/SceneBulkMotionConfig'
import VideoPlayerExportControls from './VideoPlayerExportControls'
import VideoPlayerSceneMotionControls from './VideoPlayerSceneMotionControls'
import VideoPlayerSubtitleControls from './VideoPlayerSubtitleControls'
import { useI18n } from '../../i18n/useI18n'
import './VideoPlayerFrameControls.css'

export default function VideoPlayerFrameControls({
  visibleSection,
  framePresetId,
  onFramePresetChange,
  exportQualityProfileId,
  onExportQualityProfileChange,
  exportFileName,
  onExportFileNameChange,
  exportOutputDirectory,
  onChooseExportOutputDirectory,
  frameBackground,
  onFrameBackgroundChange,
  subtitleSettings,
  onSubtitleSettingsChange,
  onBackgroundImageChange,
  videoVolume,
  voiceoverVolume,
  onVideoVolumeChange,
  onVoiceoverVolumeChange,
  hasVoiceoverTrack,
  selectedScene,
  selectedSceneIndex,
  onSceneMotionChange,
  onDetectSceneFace,
  bulkMotionScenes,
  bulkMotionRules,
  onBulkMotionRulesChange,
  onApplyBulkMotionConfig,
}) {
  const { t } = useI18n()
  const backgroundInputRef = useRef(null)
  const activeFramePreset = getFramePresetById(framePresetId)
  const fadePreset = getVideoFadePresetById(frameBackground?.presetId)
  const isVideoFadeActive = isVideoFadeFrameBackground(frameBackground)
  const isImageActive = isImageFrameBackground(frameBackground)
  const activeBackgroundMode = isVideoFadeActive ? 'fade' : isImageActive ? 'image' : 'color'
  const selectedColor = FRAME_BACKGROUND_OPTIONS.find((option) => option.value === frameBackground)
  const activeBackgroundLabel = getFrameBackgroundLabel(frameBackground)
  const selectedColorValue = selectedColor?.value || DEFAULT_FRAME_BACKGROUND
  const isFrameSectionVisible = !visibleSection || visibleSection === 'frame'
  const isExportSectionVisible = visibleSection === 'export'
  const isBackgroundSectionVisible = !visibleSection || visibleSection === 'background'
  const isAudioSectionVisible = visibleSection === 'audio'
  const isSubtitleSectionVisible = visibleSection === 'subtitle'
  const isSceneSectionVisible = visibleSection === 'scene'
  const isSceneBulkSectionVisible = visibleSection === 'scene-bulk'
  const normalizedSubtitleSettings = normalizeSubtitleSettings(subtitleSettings || DEFAULT_SUBTITLE_SETTINGS)
  const videoVolumePercent = Math.round((videoVolume || 0) * 100)
  const voiceoverVolumePercent = Math.round((voiceoverVolume || 0) * 100)
  const controlsKicker = visibleSection === 'background'
    ? t('panel.videoPlayer.frameControls.kicker.background')
    : visibleSection === 'export'
      ? t('panel.videoPlayer.frameControls.kicker.export')
    : visibleSection === 'scene-bulk'
      ? t('panel.videoPlayer.frameControls.kicker.sceneBulk')
    : visibleSection === 'scene'
      ? t('panel.videoPlayer.frameControls.kicker.scene')
    : visibleSection === 'subtitle'
      ? t('panel.videoPlayer.frameControls.kicker.subtitle')
    : visibleSection === 'audio'
      ? t('panel.videoPlayer.frameControls.kicker.audio')
      : t('panel.videoPlayer.frameControls.kicker.frame')
  const controlsTitle = visibleSection === 'background'
    ? t('panel.videoPlayer.frameControls.title.background')
    : visibleSection === 'export'
      ? t('panel.videoPlayer.frameControls.title.export')
    : visibleSection === 'scene-bulk'
      ? t('panel.videoPlayer.frameControls.title.sceneBulk')
    : visibleSection === 'scene'
      ? t('panel.videoPlayer.frameControls.title.scene')
    : visibleSection === 'subtitle'
      ? t('panel.videoPlayer.frameControls.title.subtitle')
    : visibleSection === 'audio'
      ? t('panel.videoPlayer.frameControls.title.audio')
      : t('panel.videoPlayer.frameControls.title.frame')
  const controlsSubtitle = visibleSection === 'background'
    ? t('panel.videoPlayer.frameControls.subtitle.background')
    : visibleSection === 'export'
      ? t('panel.videoPlayer.frameControls.subtitle.export')
    : visibleSection === 'scene-bulk'
      ? t('panel.videoPlayer.frameControls.subtitle.sceneBulk')
    : visibleSection === 'scene'
      ? t('panel.videoPlayer.frameControls.subtitle.scene')
    : visibleSection === 'subtitle'
      ? t('panel.videoPlayer.frameControls.subtitle.subtitle')
    : visibleSection === 'audio'
      ? t('panel.videoPlayer.frameControls.subtitle.audio')
      : t('panel.videoPlayer.frameControls.subtitle.frame')
  const framePresetCopy = {
    'landscape-16-9': t('panel.videoPlayer.frameControls.presetCopy.landscape169'),
    'portrait-9-16': t('panel.videoPlayer.frameControls.presetCopy.portrait916'),
    'square-1-1': t('panel.videoPlayer.frameControls.presetCopy.square11'),
    'portrait-4-5': t('panel.videoPlayer.frameControls.presetCopy.portrait45'),
  }

  const handleChooseBackgroundImage = useCallback(() => {
    backgroundInputRef.current?.click()
  }, [])

  const handleActivateColorMode = useCallback(() => {
    onFrameBackgroundChange?.(selectedColorValue)
  }, [onFrameBackgroundChange, selectedColorValue])

  const handleActivateFadeMode = useCallback(() => {
    onFrameBackgroundChange?.(createVideoFadeFrameBackground(fadePreset.id))
  }, [fadePreset.id, onFrameBackgroundChange])

  const handleActivateImageMode = useCallback(() => {
    if (!isImageActive) {
      handleChooseBackgroundImage()
    }
  }, [handleChooseBackgroundImage, isImageActive])

  return (
    <div className="video-frame-controls-panel dev-locator-host">
      <DeveloperLocator code="panel.video-player.frame-controls" title="Frame Controls" />
      <div className="video-frame-controls-head">
        <div className="video-frame-controls-copy">
          <span className="video-frame-controls-kicker">{controlsKicker}</span>
          <h3 className="video-frame-controls-title">{controlsTitle}</h3>
          <p className="video-frame-controls-subtitle">{controlsSubtitle}</p>
        </div>
      </div>

      {isFrameSectionVisible && (
        <section className="video-frame-section dev-locator-host">
          <DeveloperLocator code="panel.video-player.frame-controls.preset" title="Frame Preset Control" />
          <div className="video-frame-section-head">
            <div>
              <span className="video-frame-section-label">{t('panel.videoPlayer.frameControls.exportRatio')}</span>
              <strong className="video-frame-section-value">{activeFramePreset.label}</strong>
            </div>
            <span className="video-frame-section-caption">{framePresetCopy[activeFramePreset.id]}</span>
          </div>
          <div className="video-frame-preset-grid">
            {FRAME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`frame-option-btn ${preset.id === framePresetId ? 'active' : ''}`}
                onClick={() => onFramePresetChange?.(preset.id)}
                aria-pressed={preset.id === framePresetId}
                title={framePresetCopy[preset.id] || preset.label}
              >
                <span className="frame-option-btn-label">{preset.label}</span>
                <span className="frame-option-btn-meta">{framePresetCopy[preset.id] || t('panel.videoPlayer.frameControls.exportFrameRatio')}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {isExportSectionVisible && (
        <VideoPlayerExportControls
          exportQualityProfileId={exportQualityProfileId}
          onExportQualityProfileChange={onExportQualityProfileChange}
          exportFileName={exportFileName}
          onExportFileNameChange={onExportFileNameChange}
          exportOutputDirectory={exportOutputDirectory}
          onChooseExportOutputDirectory={onChooseExportOutputDirectory}
        />
      )}

      {isBackgroundSectionVisible && (
        <section className="video-frame-section dev-locator-host">
          <DeveloperLocator code="panel.video-player.frame-controls.background" title="Frame Background Control" />
          <div className="video-frame-section-head">
            <div>
              <span className="video-frame-section-label">{t('panel.videoPlayer.frameControls.coverBackground')}</span>
              <strong className="video-frame-section-value">{activeBackgroundLabel}</strong>
            </div>
            <span className="video-frame-section-caption">{t('panel.videoPlayer.frameControls.activeBackgroundOnly')}</span>
          </div>

          <div className="video-frame-mode-switcher" role="tablist" aria-label={t('panel.videoPlayer.frameControls.chooseBackgroundMode')}>
            <button
              type="button"
              className={`frame-mode-btn ${activeBackgroundMode === 'color' ? 'active' : ''}`}
              onClick={handleActivateColorMode}
              aria-pressed={activeBackgroundMode === 'color'}
            >
              {t('panel.videoPlayer.frameControls.color')}
            </button>
            <button
              type="button"
              className={`frame-mode-btn ${activeBackgroundMode === 'fade' ? 'active' : ''}`}
              onClick={handleActivateFadeMode}
              aria-pressed={activeBackgroundMode === 'fade'}
            >
              {t('panel.videoPlayer.frameControls.fade')}
            </button>
            <button
              type="button"
              className={`frame-mode-btn ${activeBackgroundMode === 'image' ? 'active' : ''}`}
              onClick={handleActivateImageMode}
              aria-pressed={activeBackgroundMode === 'image'}
            >
              {t('panel.videoPlayer.frameControls.image')}
            </button>
          </div>

          {activeBackgroundMode === 'color' && (
            <div className="video-frame-detail-panel dev-locator-host">
              <DeveloperLocator code="panel.video-player.frame-controls.background-color" title="Color Background Detail" />
              <div>
                <div className="video-frame-detail-title">{t('panel.videoPlayer.frameControls.backgroundColor')}</div>
                <p className="video-frame-detail-copy">{t('panel.videoPlayer.frameControls.backgroundColorHint')}</p>
              </div>
              <div className="video-frame-color-grid">
                {FRAME_BACKGROUND_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`frame-color-chip ${option.value === frameBackground ? 'active' : ''}`}
                    onClick={() => onFrameBackgroundChange?.(option.value)}
                    title={option.label}
                    aria-label={option.label}
                    aria-pressed={option.value === frameBackground}
                  >
                    <span className="frame-color-chip-preview" style={{ '--frame-swatch': option.value }} />
                    <span className="frame-color-chip-label">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeBackgroundMode === 'fade' && (
            <div className="video-frame-detail-panel dev-locator-host">
              <DeveloperLocator code="panel.video-player.frame-controls.fade-config" title="Fade Config" />
              <div>
                <div className="video-frame-detail-title">{t('panel.videoPlayer.frameControls.fadeStrength')}</div>
                <p className="video-frame-detail-copy">{t('panel.videoPlayer.frameControls.fadeHint')}</p>
              </div>
              <div className="video-frame-field-row">
                <label className="video-frame-field-label" htmlFor="video-fade-preset-select">{t('panel.videoPlayer.frameControls.fadePreset')}</label>
                <select
                  id="video-fade-preset-select"
                  className="video-frame-field-select"
                  value={fadePreset.id}
                  onChange={(event) => onFrameBackgroundChange?.(createVideoFadeFrameBackground(event.target.value))}
                >
                  {VIDEO_FADE_PRESET_OPTIONS.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {activeBackgroundMode === 'image' && (
            <div className="video-frame-detail-panel dev-locator-host">
              <DeveloperLocator code="panel.video-player.frame-controls.background-image" title="Image Background Detail" />
              <div>
                <div className="video-frame-detail-title">{t('panel.videoPlayer.frameControls.customBackgroundImage')}</div>
                <p className="video-frame-detail-copy">{t('panel.videoPlayer.frameControls.customBackgroundImageHint')}</p>
              </div>
              <button
                type="button"
                className="video-frame-upload-btn"
                onClick={handleChooseBackgroundImage}
              >
                {isImageActive ? t('panel.videoPlayer.frameControls.replaceBackgroundImage') : t('panel.videoPlayer.frameControls.uploadBackgroundImage')}
              </button>
              <div className="video-frame-image-note">
                {isImageActive
                  ? <>{t('panel.videoPlayer.frameControls.usingImage', { name: frameBackground.name || t('panel.videoPlayer.frameControls.selectedBackgroundImage') })}</>
                  : t('panel.videoPlayer.frameControls.noBackgroundImage')}
              </div>
            </div>
          )}
        </section>
      )}

      {isAudioSectionVisible && (
        <section className="video-frame-section dev-locator-host">
          <DeveloperLocator code="panel.video-player.audio-controls" title="Audio Controls" />
          <div className="video-frame-section-head">
            <div>
              <span className="video-frame-section-label">{t('panel.videoPlayer.frameControls.previewMix')}</span>
              <strong className="video-frame-section-value">{t('panel.videoPlayer.frameControls.videoVoiceoverMix', { video: videoVolumePercent, voiceover: voiceoverVolumePercent })}</strong>
            </div>
            <span className="video-frame-section-caption">{t('panel.videoPlayer.frameControls.openFromVoiceoverTrack')}</span>
          </div>

          <div className="video-frame-detail-panel">
            <div>
              <div className="video-frame-detail-title">{t('panel.videoPlayer.frameControls.sourceVideoVolume')}</div>
              <p className="video-frame-detail-copy">{t('panel.videoPlayer.frameControls.sourceVideoVolumeHint')}</p>
            </div>
            <div className="video-frame-field-row">
              <label className="video-frame-field-label" htmlFor="video-preview-volume-range">{t('panel.videoPlayer.frameControls.videoVolume')}</label>
              <div className="video-audio-slider-row">
                <input
                  id="video-preview-volume-range"
                  className="video-audio-slider"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={videoVolume}
                  onChange={(event) => onVideoVolumeChange?.(parseFloat(event.target.value))}
                />
                <span className="video-audio-slider-value">{videoVolumePercent}%</span>
              </div>
            </div>
          </div>

          <div className="video-frame-detail-panel">
            <div>
              <div className="video-frame-detail-title">{t('panel.videoPlayer.frameControls.voiceoverVolume')}</div>
              <p className="video-frame-detail-copy">{t('panel.videoPlayer.frameControls.voiceoverVolumeHint')}</p>
            </div>
            <div className="video-frame-field-row">
              <label className="video-frame-field-label" htmlFor="voiceover-preview-volume-range">{t('panel.videoPlayer.frameControls.voiceoverVolume')}</label>
              <div className="video-audio-slider-row">
                <input
                  id="voiceover-preview-volume-range"
                  className="video-audio-slider"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={voiceoverVolume}
                  onChange={(event) => onVoiceoverVolumeChange?.(parseFloat(event.target.value))}
                  disabled={!hasVoiceoverTrack}
                />
                <span className="video-audio-slider-value">{voiceoverVolumePercent}%</span>
              </div>
            </div>
            <div className="video-frame-image-note">
              {hasVoiceoverTrack
                ? t('panel.videoPlayer.frameControls.voiceoverActiveHint')
                : t('panel.videoPlayer.frameControls.voiceoverMissingHint')}
            </div>
          </div>
        </section>
      )}

      {isSubtitleSectionVisible && (
        <VideoPlayerSubtitleControls
          subtitleSettings={normalizedSubtitleSettings}
          onSubtitleSettingsChange={onSubtitleSettingsChange}
        />
      )}

      {isSceneSectionVisible && (
        <VideoPlayerSceneMotionControls
          scene={selectedScene}
          sceneIndex={selectedSceneIndex}
          onSceneMotionChange={onSceneMotionChange}
          onDetectSceneFace={onDetectSceneFace}
        />
      )}

      {isSceneBulkSectionVisible && (
        <SceneBulkMotionConfig
          scenes={bulkMotionScenes}
          rules={bulkMotionRules}
          onRulesChange={onBulkMotionRulesChange}
          onApplyBulkMotionConfig={onApplyBulkMotionConfig}
        />
      )}

      <input
        ref={backgroundInputRef}
        className="frame-image-input"
        type="file"
        accept="image/*"
        onChange={onBackgroundImageChange}
      />
    </div>
  )
}