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
import './VideoPlayerFrameControls.css'

const FRAME_PRESET_COPY = {
  'landscape-16-9': 'Landscape frame for desktop and YouTube',
  'portrait-9-16': 'Vertical frame for Reels, Stories, and Shorts',
  'square-1-1': 'Compact square layout for social posts',
  'portrait-4-5': 'Feed-friendly ratio focused on the center subject',
}

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
  onApplyBulkMotionConfig,
}) {
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
    ? 'Background'
    : visibleSection === 'export'
      ? 'Export'
    : visibleSection === 'scene-bulk'
      ? 'Scenes'
    : visibleSection === 'scene'
      ? 'Scene'
    : visibleSection === 'subtitle'
      ? 'Subtitles'
    : visibleSection === 'audio'
      ? 'Audio'
      : 'Frame'
  const controlsTitle = visibleSection === 'background'
    ? 'Video background settings'
    : visibleSection === 'export'
      ? 'Export output settings'
    : visibleSection === 'scene-bulk'
      ? 'Quick scene config'
    : visibleSection === 'scene'
      ? 'Scene motion settings'
    : visibleSection === 'subtitle'
      ? 'Preview and export subtitle settings'
    : visibleSection === 'audio'
      ? 'Preview and export audio settings'
      : 'Video frame settings'
  const controlsSubtitle = visibleSection === 'background'
    ? 'Only the active background controls stay visible so the sidebar remains focused.'
    : visibleSection === 'export'
      ? 'Choose the file size profile, local output folder, and final export file name before rendering.'
    : visibleSection === 'scene-bulk'
      ? 'Add conditions and actions to configure matching scenes from the scene list.'
    : visibleSection === 'scene'
      ? 'Configure face-targeted zoom mode for the selected scene card.'
    : visibleSection === 'subtitle'
      ? 'Open this from the timeline subtitle track to adjust subtitle styling for both preview and export.'
    : visibleSection === 'audio'
      ? 'Adjust source video and voiceover levels separately. These values are used for both preview and export.'
      : 'Keep the frame ratio controls close at hand without cluttering the preview area.'

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
              <span className="video-frame-section-label">Export ratio</span>
              <strong className="video-frame-section-value">{activeFramePreset.label}</strong>
            </div>
            <span className="video-frame-section-caption">{FRAME_PRESET_COPY[activeFramePreset.id]}</span>
          </div>
          <div className="video-frame-preset-grid">
            {FRAME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`frame-option-btn ${preset.id === framePresetId ? 'active' : ''}`}
                onClick={() => onFramePresetChange?.(preset.id)}
                aria-pressed={preset.id === framePresetId}
                title={FRAME_PRESET_COPY[preset.id] || preset.label}
              >
                <span className="frame-option-btn-label">{preset.label}</span>
                <span className="frame-option-btn-meta">{FRAME_PRESET_COPY[preset.id] || 'Export frame ratio'}</span>
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
              <span className="video-frame-section-label">Cover background</span>
              <strong className="video-frame-section-value">{activeBackgroundLabel}</strong>
            </div>
            <span className="video-frame-section-caption">Only the active background mode shows detailed controls</span>
          </div>

          <div className="video-frame-mode-switcher" role="tablist" aria-label="Choose background mode">
            <button
              type="button"
              className={`frame-mode-btn ${activeBackgroundMode === 'color' ? 'active' : ''}`}
              onClick={handleActivateColorMode}
              aria-pressed={activeBackgroundMode === 'color'}
            >
              Color
            </button>
            <button
              type="button"
              className={`frame-mode-btn ${activeBackgroundMode === 'fade' ? 'active' : ''}`}
              onClick={handleActivateFadeMode}
              aria-pressed={activeBackgroundMode === 'fade'}
            >
              Fade
            </button>
            <button
              type="button"
              className={`frame-mode-btn ${activeBackgroundMode === 'image' ? 'active' : ''}`}
              onClick={handleActivateImageMode}
              aria-pressed={activeBackgroundMode === 'image'}
            >
              Image
            </button>
          </div>

          {activeBackgroundMode === 'color' && (
            <div className="video-frame-detail-panel dev-locator-host">
              <DeveloperLocator code="panel.video-player.frame-controls.background-color" title="Color Background Detail" />
              <div>
                <div className="video-frame-detail-title">Background color</div>
                <p className="video-frame-detail-copy">Use a clean solid background when subtitle readability matters most.</p>
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
                <div className="video-frame-detail-title">Video fade strength</div>
                <p className="video-frame-detail-copy">Increase or reduce the fade treatment to balance atmosphere and subject focus.</p>
              </div>
              <div className="video-frame-field-row">
                <label className="video-frame-field-label" htmlFor="video-fade-preset-select">Fade preset</label>
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
                <div className="video-frame-detail-title">Custom background image</div>
                <p className="video-frame-detail-copy">Use this when you already have artwork or a dedicated cover image.</p>
              </div>
              <button
                type="button"
                className="video-frame-upload-btn"
                onClick={handleChooseBackgroundImage}
              >
                {isImageActive ? 'Replace background image' : 'Upload background image'}
              </button>
              <div className="video-frame-image-note">
                {isImageActive
                  ? <>Using: <strong>{frameBackground.name || 'Selected background image'}</strong></>
                  : 'No background image selected yet.'}
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
              <span className="video-frame-section-label">Preview mix</span>
              <strong className="video-frame-section-value">Video {videoVolumePercent}% • Voiceover {voiceoverVolumePercent}%</strong>
            </div>
            <span className="video-frame-section-caption">Open this directly from the voiceover track on the timeline.</span>
          </div>

          <div className="video-frame-detail-panel">
            <div>
              <div className="video-frame-detail-title">Source video volume</div>
              <p className="video-frame-detail-copy">Lower the video bed when the voiceover needs to stand out, or raise it to keep more of the original sound.</p>
            </div>
            <div className="video-frame-field-row">
              <label className="video-frame-field-label" htmlFor="video-preview-volume-range">Video volume</label>
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
              <div className="video-frame-detail-title">Voiceover volume</div>
              <p className="video-frame-detail-copy">Adjust narration level so speech stays clear without overpowering the rest of the track.</p>
            </div>
            <div className="video-frame-field-row">
              <label className="video-frame-field-label" htmlFor="voiceover-preview-volume-range">Voiceover volume</label>
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
                ? 'The voiceover track is active on the timeline and uses this level for both preview and export.'
                : 'No voiceover track is attached yet. Generate one first, then return here.'}
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