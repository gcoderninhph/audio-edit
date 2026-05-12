import { useMemo, useState } from 'react'
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator'
import {
  DEFAULT_SCENE_MOTION_CONFIG,
  SCENE_MOTION_MODES,
  normalizeSceneMotionConfig,
} from '../../utils/sceneMotion'
import { isFaceDetectionAvailable } from '../../utils/faceDetection'

const SCENE_MOTION_MODE_OPTIONS = [
  { value: SCENE_MOTION_MODES.NONE, label: 'None' },
  { value: SCENE_MOTION_MODES.ZOOM_IN, label: 'Zoom in' },
  { value: SCENE_MOTION_MODES.ANIMATION_ZOOM_OUT, label: 'Animation zoom out' },
  { value: SCENE_MOTION_MODES.ANIMATION_ZOOM_IN, label: 'Animation zoom in' },
]

const SCENE_MOTION_MODE_SUMMARY = {
  [SCENE_MOTION_MODES.NONE]: 'No zoom is applied to this scene.',
  [SCENE_MOTION_MODES.ZOOM_IN]: 'Static zoom for the full scene.',
  [SCENE_MOTION_MODES.ANIMATION_ZOOM_OUT]: 'Starts zoomed in, then returns to normal.',
  [SCENE_MOTION_MODES.ANIMATION_ZOOM_IN]: 'Starts normal, then zooms toward the target.',
}

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
  const [statusText, setStatusText] = useState('')
  const [isDetectingFace, setIsDetectingFace] = useState(false)
  const motionConfig = useMemo(() => normalizeSceneMotionConfig(scene?.motion), [scene?.motion])
  const faceDetectionAvailable = isFaceDetectionAvailable()
  const targetStatusText = statusText || (motionConfig.detectionStatus === 'center-fallback'
    ? 'No face target found. Center target will be used.'
    : faceDetectionAvailable
      ? 'Detection uses the middle frame of this scene.'
      : 'Face detection is not available. Center target is used unless X/Y is edited.')

  if (!scene) {
    return (
      <section className="video-frame-section dev-locator-host">
        <DeveloperLocator code="panel.video-player.scene-motion.empty" title="Scene Motion Empty State" />
        <div className="video-frame-section-head">
          <div>
            <span className="video-frame-section-label">Scene motion</span>
            <strong className="video-frame-section-value">No scene selected</strong>
          </div>
          <span className="video-frame-section-caption">Select a scene card to edit its motion settings.</span>
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
    setStatusText('Detecting face...')
    try {
      const face = await onDetectSceneFace(scene.id)
      setStatusText(face.fallback
        ? 'No face target found. Center target will be used.'
        : `Face target set at ${formatPercent(face.focusX)} / ${formatPercent(face.focusY)}.`)
    } catch (error) {
      setStatusText(error?.message || 'Face detection failed.')
    } finally {
      setIsDetectingFace(false)
    }
  }

  return (
    <section className="video-frame-section dev-locator-host">
      <DeveloperLocator code="panel.video-player.scene-motion" title="Scene Motion Controls" />
      <div className="video-frame-section-head">
        <div>
          <span className="video-frame-section-label">Scene motion</span>
          <strong className="video-frame-section-value">
            Scene {sceneIndex >= 0 ? sceneIndex + 1 : scene.id}
          </strong>
        </div>
        <span className="video-frame-section-caption">
          {formatTime(scene.start)} - {formatTime(scene.end)} • {scene.duration.toFixed(1)}s
        </span>
      </div>

      <div className="video-frame-detail-panel dev-locator-host">
        <DeveloperLocator code="panel.video-player.scene-motion.mode" title="Scene Motion Mode Control" />
        <label className="video-frame-field-row" htmlFor="scene-motion-mode">
          <span className="video-frame-field-label">Zoom mode</span>
          <select
            id="scene-motion-mode"
            className="video-frame-field-select"
            value={motionConfig.mode}
            onChange={(event) => applyMotion({ mode: event.target.value })}
          >
            {SCENE_MOTION_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <div className="video-frame-image-note">
          {SCENE_MOTION_MODE_SUMMARY[motionConfig.mode] || SCENE_MOTION_MODE_SUMMARY[SCENE_MOTION_MODES.NONE]}
        </div>
      </div>

      <div className="video-frame-detail-panel dev-locator-host">
        <DeveloperLocator code="panel.video-player.scene-motion.zoom" title="Scene Motion Zoom Control" />
        <div>
          <div className="video-frame-detail-title">Zoom ratio</div>
          <p className="video-frame-detail-copy">Peak scale: {motionConfig.zoomScale.toFixed(2)}x</p>
        </div>
        <div className="video-frame-field-row">
          <label className="video-frame-field-label" htmlFor="scene-motion-zoom-scale">Zoom scale</label>
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
          <div className="video-frame-detail-title">Face target</div>
          <p className="video-frame-detail-copy">
            Target {formatPercent(motionConfig.focusX)} / {formatPercent(motionConfig.focusY)}
          </p>
        </div>
        <button
          type="button"
          className="video-frame-upload-btn"
          onClick={handleDetectFace}
          disabled={isDetectingFace}
          title={faceDetectionAvailable ? 'Detect face in this scene' : 'Use center target because FaceDetector is unavailable'}
        >
          {isDetectingFace ? 'Detecting...' : 'Detect face'}
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
        Reset scene motion
      </button>
    </section>
  )
}
