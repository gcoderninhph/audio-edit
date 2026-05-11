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
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator'
import './VideoPlayerFrameControls.css'

const FRAME_PRESET_COPY = {
  'landscape-16-9': 'Video ngang cho desktop và YouTube',
  'portrait-9-16': 'Khung dọc cho Reel, Story, Shorts',
  'square-1-1': 'Dáng vuông gọn cho bài đăng mạng xã hội',
  'portrait-4-5': 'Tỉ lệ feed ưu tiên nội dung trung tâm',
}

export default function VideoPlayerFrameControls({
  visibleSection,
  framePresetId,
  onFramePresetChange,
  frameBackground,
  onFrameBackgroundChange,
  onBackgroundImageChange,
  videoVolume,
  voiceoverVolume,
  onVideoVolumeChange,
  onVoiceoverVolumeChange,
  hasVoiceoverTrack,
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
  const isBackgroundSectionVisible = !visibleSection || visibleSection === 'background'
  const isAudioSectionVisible = visibleSection === 'audio'
  const videoVolumePercent = Math.round((videoVolume || 0) * 100)
  const voiceoverVolumePercent = Math.round((voiceoverVolume || 0) * 100)
  const controlsKicker = visibleSection === 'background'
    ? 'Chỉnh nền'
    : visibleSection === 'audio'
      ? 'Chỉnh âm thanh'
      : 'Chỉnh khung'
  const controlsTitle = visibleSection === 'background'
    ? 'Thiết lập nền video'
    : visibleSection === 'audio'
      ? 'Cân chỉnh âm thanh xem trước'
      : 'Thiết lập khung video'
  const controlsSubtitle = visibleSection === 'background'
    ? 'Mở đúng phần nền cần dùng, phần còn lại được ẩn để nav trái gọn hơn.'
    : visibleSection === 'audio'
      ? 'Tinh chỉnh riêng âm lượng video gốc và thuyết minh để phần nghe cân bằng hơn trong lúc xem trước.'
      : 'Chỉ giữ lại tùy chọn tỉ lệ khung để bạn chỉnh nhanh mà không làm rối vùng xem trước.'

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
              <span className="video-frame-section-label">Tỉ lệ xuất</span>
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
                <span className="frame-option-btn-meta">{FRAME_PRESET_COPY[preset.id] || 'Tỉ lệ khung xuất'}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {isBackgroundSectionVisible && (
        <section className="video-frame-section dev-locator-host">
          <DeveloperLocator code="panel.video-player.frame-controls.background" title="Frame Background Control" />
          <div className="video-frame-section-head">
            <div>
              <span className="video-frame-section-label">Nền bìa</span>
              <strong className="video-frame-section-value">{activeBackgroundLabel}</strong>
            </div>
            <span className="video-frame-section-caption">Chỉ hiện chi tiết của kiểu nền đang dùng</span>
          </div>

          <div className="video-frame-mode-switcher" role="tablist" aria-label="Chọn kiểu nền">
            <button
              type="button"
              className={`frame-mode-btn ${activeBackgroundMode === 'color' ? 'active' : ''}`}
              onClick={handleActivateColorMode}
              aria-pressed={activeBackgroundMode === 'color'}
            >
              Màu
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
              Ảnh
            </button>
          </div>

          {activeBackgroundMode === 'color' && (
            <div className="video-frame-detail-panel dev-locator-host">
              <DeveloperLocator code="panel.video-player.frame-controls.background-color" title="Color Background Detail" />
              <div>
                <div className="video-frame-detail-title">Chọn màu nền</div>
                <p className="video-frame-detail-copy">Dùng khi cần nền gọn, dễ đọc subtitle, ít gây nhiễu thị giác.</p>
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
                <div className="video-frame-detail-title">Mức fade video</div>
                <p className="video-frame-detail-copy">Tăng hoặc giảm độ mờ để giữ chiều sâu mà vẫn làm chủ thể nổi hơn.</p>
              </div>
              <div className="video-frame-field-row">
                <label className="video-frame-field-label" htmlFor="video-fade-preset-select">Preset fade</label>
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
                <div className="video-frame-detail-title">Ảnh nền riêng</div>
                <p className="video-frame-detail-copy">Phù hợp khi bạn đã có artwork hoặc ảnh bìa riêng cho video.</p>
              </div>
              <button
                type="button"
                className="video-frame-upload-btn"
                onClick={handleChooseBackgroundImage}
              >
                {isImageActive ? 'Thay ảnh nền' : 'Tải ảnh nền'}
              </button>
              <div className="video-frame-image-note">
                {isImageActive
                  ? <>Đang dùng: <strong>{frameBackground.name || 'Ảnh nền đã chọn'}</strong></>
                  : 'Chưa có ảnh nền nào được chọn.'}
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
              <span className="video-frame-section-label">Mix xem trước</span>
              <strong className="video-frame-section-value">Video {videoVolumePercent}% • Thuyết minh {voiceoverVolumePercent}%</strong>
            </div>
            <span className="video-frame-section-caption">Mục này mở nhanh khi bạn click trực tiếp vào track voiceover trên timeline.</span>
          </div>

          <div className="video-frame-detail-panel">
            <div>
              <div className="video-frame-detail-title">Âm lượng video gốc</div>
              <p className="video-frame-detail-copy">Giảm nền video khi lời thuyết minh cần nổi hơn, hoặc tăng lại nếu muốn giữ nhiều âm thanh gốc hơn.</p>
            </div>
            <div className="video-frame-field-row">
              <label className="video-frame-field-label" htmlFor="video-preview-volume-range">Âm lượng video</label>
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
              <div className="video-frame-detail-title">Âm lượng thuyết minh</div>
              <p className="video-frame-detail-copy">Tinh chỉnh mức đọc của voiceover để lời nói không bị nền video lấn át hoặc quá gắt.</p>
            </div>
            <div className="video-frame-field-row">
              <label className="video-frame-field-label" htmlFor="voiceover-preview-volume-range">Âm lượng thuyết minh</label>
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
                ? 'Track thuyết minh đang hoạt động trên timeline và sẽ nghe theo mức âm lượng này trong lúc preview.'
                : 'Chưa có track thuyết minh để chỉnh. Hãy tạo thuyết minh trước rồi quay lại mục này.'}
            </div>
          </div>
        </section>
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