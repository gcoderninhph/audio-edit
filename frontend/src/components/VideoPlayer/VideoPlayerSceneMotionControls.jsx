import { useMemo, useState } from 'react'
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator'
import {
  DEFAULT_SCENE_MOTION_CONFIG,
  SCENE_MOTION_MODES,
  normalizeSceneMotionConfig,
} from '../../utils/sceneMotion'
import { isFaceDetectionAvailable } from '../../utils/faceDetection'
import { useI18n } from '../../i18n/useI18n'

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`
}

export default function VideoPlayerSceneMotionControls({
  scene,
  sceneIndex = -1,
  onSceneMotionChange,
  onDetectSceneFace,
}) {
  const { t } = useI18n()
  const [statusText, setStatusText] = useState('')
  const [isDetectingFace, setIsDetectingFace] = useState(false)
  const motionConfig = useMemo(() => normalizeSceneMotionConfig(scene?.motion), [scene?.motion])
  const faceDetectionAvailable = isFaceDetectionAvailable()
  const sceneMotionModeOptions = useMemo(() => ([
    { value: SCENE_MOTION_MODES.NONE, label: t('panel.videoPlayer.sceneMotion.none') },
    { value: SCENE_MOTION_MODES.ZOOM_IN, label: t('panel.videoPlayer.sceneMotion.zoomIn') },
    { value: SCENE_MOTION_MODES.ANIMATION_ZOOM_OUT, label: t('panel.videoPlayer.sceneMotion.animationZoomOut') },
    { value: SCENE_MOTION_MODES.ANIMATION_ZOOM_IN, label: t('panel.videoPlayer.sceneMotion.animationZoomIn') },
  ]), [t])
  const sceneMotionModeSummary = useMemo(() => ({
    [SCENE_MOTION_MODES.NONE]: t('panel.videoPlayer.sceneMotion.summaryNone'),
    [SCENE_MOTION_MODES.ZOOM_IN]: t('panel.videoPlayer.sceneMotion.summaryZoomIn'),
    [SCENE_MOTION_MODES.ANIMATION_ZOOM_OUT]: t('panel.videoPlayer.sceneMotion.summaryAnimationZoomOut'),
    [SCENE_MOTION_MODES.ANIMATION_ZOOM_IN]: t('panel.videoPlayer.sceneMotion.summaryAnimationZoomIn'),
  }), [t])
  const targetStatusText = statusText || (motionConfig.detectionStatus === 'center-fallback'
    ? t('panel.videoPlayer.sceneMotion.noFaceTargetFound')
    : faceDetectionAvailable
      ? t('panel.videoPlayer.sceneMotion.detectionMiddleFrame')
      : t('panel.videoPlayer.sceneMotion.detectionUnavailable'))

  if (!scene) {
    return (
      <section className="video-frame-section dev-locator-host">
        <DeveloperLocator code="panel.video-player.scene-motion.empty" title="Scene Motion Empty State" />
        <div className="video-frame-section-head">
          <div>
            <span className="video-frame-section-label">{t('panel.videoPlayer.sceneMotion.sectionLabel')}</span>
            <strong className="video-frame-section-value">{t('panel.videoPlayer.sceneMotion.noSceneSelected')}</strong>
          </div>
          <span className="video-frame-section-caption">{t('panel.videoPlayer.sceneMotion.selectSceneHint')}</span>
        </div>
      </section>
    )
  }

  const applyMotion = (partialConfig) => {
    onSceneMotionChange?.(scene.id, {
      ...motionConfig,
      ...partialConfig,
    })
  }

  const handleDetectFace = async () => {
    if (!onDetectSceneFace) {
      return
    }

    setIsDetectingFace(true)
    setStatusText(t('panel.videoPlayer.sceneMotion.detectingFace'))
    try {
      const face = await onDetectSceneFace(scene.id)
      setStatusText(face.fallback
        ? t('panel.videoPlayer.sceneMotion.noFaceTargetFound')
        : t('panel.videoPlayer.sceneMotion.faceTargetSet', {
          x: formatPercent(face.focusX),
          y: formatPercent(face.focusY),
        }))
    } catch (error) {
      setStatusText(error?.message || t('panel.videoPlayer.sceneMotion.faceDetectionFailed'))
    } finally {
      setIsDetectingFace(false)
    }
  }

  return (
    <section className="video-frame-section dev-locator-host">
      <DeveloperLocator code="panel.video-player.scene-motion" title="Scene Motion Controls" />
      <div className="video-frame-section-head">
        <div>
          <span className="video-frame-section-label">{t('panel.videoPlayer.sceneMotion.sectionLabel')}</span>
          <strong className="video-frame-section-value">
            {t('panel.videoPlayer.sceneMotion.sceneValue', { index: sceneIndex >= 0 ? sceneIndex + 1 : scene.id })}
          </strong>
        </div>
        <span className="video-frame-section-caption">
          {t('panel.videoPlayer.sceneMotion.sceneTimeInfo', {
            start: formatTime(scene.start),
            end: formatTime(scene.end),
            duration: scene.duration.toFixed(1),
          })}
        </span>
      </div>

      <div className="video-frame-detail-panel dev-locator-host">
        <DeveloperLocator code="panel.video-player.scene-motion.mode" title="Scene Motion Mode Control" />
        <label className="video-frame-field-row" htmlFor="scene-motion-mode">
          <span className="video-frame-field-label">{t('panel.videoPlayer.sceneMotion.zoomMode')}</span>
          <select
            id="scene-motion-mode"
            className="video-frame-field-select"
            value={motionConfig.mode}
            onChange={(event) => applyMotion({ mode: event.target.value })}
          >
            {sceneMotionModeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <div className="video-frame-image-note">
          {sceneMotionModeSummary[motionConfig.mode] || sceneMotionModeSummary[SCENE_MOTION_MODES.NONE]}
        </div>
      </div>

      <div className="video-frame-detail-panel dev-locator-host">
        <DeveloperLocator code="panel.video-player.scene-motion.zoom" title="Scene Motion Zoom Control" />
        <div>
          <div className="video-frame-detail-title">{t('panel.videoPlayer.sceneMotion.zoomRatio')}</div>
          <p className="video-frame-detail-copy">{t('panel.videoPlayer.sceneMotion.peakScale', { scale: motionConfig.zoomScale.toFixed(2) })}</p>
        </div>
        <div className="video-frame-field-row">
          <label className="video-frame-field-label" htmlFor="scene-motion-zoom-scale">{t('panel.videoPlayer.sceneMotion.zoomScale')}</label>
          <div className="video-audio-slider-row">
            <input
              id="scene-motion-zoom-scale"
              className="video-audio-slider"
              type="range"
              min="1"
              max="2.2"
              step="0.02"
              value={motionConfig.zoomScale}
              onChange={(event) => applyMotion({ zoomScale: parseFloat(event.target.value) })}
            />
            <span className="video-audio-slider-value">{motionConfig.zoomScale.toFixed(2)}x</span>
          </div>
        </div>
      </div>

      <div className="video-frame-detail-panel dev-locator-host">
        <DeveloperLocator code="panel.video-player.scene-motion.face-target" title="Scene Motion Face Target Control" />
        <div>
          <div className="video-frame-detail-title">{t('panel.videoPlayer.sceneMotion.faceTarget')}</div>
          <p className="video-frame-detail-copy">
            {t('panel.videoPlayer.sceneMotion.targetValue', {
              x: formatPercent(motionConfig.focusX),
              y: formatPercent(motionConfig.focusY),
            })}
          </p>
        </div>
        <button
          type="button"
          className="video-frame-upload-btn"
          onClick={handleDetectFace}
          disabled={isDetectingFace}
          title={faceDetectionAvailable ? t('panel.videoPlayer.sceneMotion.detectFaceTitle') : t('panel.videoPlayer.sceneMotion.detectFaceUnavailableTitle')}
        >
          {isDetectingFace ? t('panel.videoPlayer.sceneMotion.detectingFace') : t('panel.videoPlayer.sceneMotion.detectFace')}
        </button>
        <div className="scene-motion-target-grid">
          <label className="video-frame-field-row">
            <span className="video-frame-field-label">X</span>
            <input
              className="video-frame-field-input"
              type="number"
              min="0"
              max="100"
              step="1"
              value={Math.round(motionConfig.focusX * 100)}
              onChange={(event) => applyMotion({ focusX: parseFloat(event.target.value) / 100 })}
            />
          </label>
          <label className="video-frame-field-row">
            <span className="video-frame-field-label">Y</span>
            <input
              className="video-frame-field-input"
              type="number"
              min="0"
              max="100"
              step="1"
              value={Math.round(motionConfig.focusY * 100)}
              onChange={(event) => applyMotion({ focusY: parseFloat(event.target.value) / 100 })}
            />
          </label>
        </div>
        <div className="video-frame-image-note">
          {targetStatusText}
        </div>
      </div>

      <button
        type="button"
        className="video-frame-upload-btn scene-motion-reset-btn"
        onClick={() => onSceneMotionChange?.(scene.id, DEFAULT_SCENE_MOTION_CONFIG)}
      >
        {t('panel.videoPlayer.sceneMotion.resetSceneMotion')}
      </button>
    </section>
  )
}
