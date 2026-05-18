import { useEffect, useMemo, useRef, useState } from 'react'
import { getFrameBackgroundFillColor } from '../../utils/frameComposer'
import { drawFrameComposition, loadFrameBackgroundImage } from '../../utils/frameCanvasRenderer'
import { getSceneMotionRenderState } from '../../utils/sceneMotion'

export default function VideoPlayerPreviewStage({
  framePreset,
  frameBackground,
  videoRef,
  voiceoverRef,
  videoUrl,
  scenes,
  deletedSceneIds,
  subtitleText,
  subtitleSettings,
  voiceoverTrack,
  onLoadedMetadata,
  onDurationChange,
  onTimeUpdate,
  onPlay,
  onPause,
  onEnded,
  onTogglePlayback,
}) {
  const [frameBackgroundImage, setFrameBackgroundImage] = useState(null)
  const canvasRef = useRef(null)
  const animationFrameRef = useRef(null)

  useEffect(() => {
    let isDisposed = false

    loadFrameBackgroundImage(frameBackground)
      .then((image) => {
        if (!isDisposed) {
          setFrameBackgroundImage(image)
        }
      })
      .catch((error) => {
        console.error('Failed to load frame background image:', error)
        if (!isDisposed) {
          setFrameBackgroundImage(null)
        }
      })

    return () => {
      isDisposed = true
    }
  }, [frameBackground])

  useEffect(() => {
    const canvasElement = canvasRef.current
    const videoElement = videoRef.current
    if (!canvasElement || !videoElement) return undefined

    canvasElement.width = framePreset.width
    canvasElement.height = framePreset.height

    const context = canvasElement.getContext('2d', { alpha: false })
    if (!context) return undefined

    const renderFrame = () => {
      const renderTime = videoElement.currentTime || 0
      const renderScene = scenes?.find((scene) => (
        renderTime >= scene.start
        && renderTime <= scene.end
        && !deletedSceneIds?.has(scene.id)
      ))

      drawFrameComposition(context, {
        framePreset,
        frameBackground,
        backgroundImage: frameBackgroundImage,
        videoElement,
        subtitleText,
        currentTime: renderTime,
        sceneMotion: renderScene ? getSceneMotionRenderState(renderScene, renderTime) : null,
        subtitleSettings,
      })
      animationFrameRef.current = window.requestAnimationFrame(renderFrame)
    }

    renderFrame()

    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [deletedSceneIds, frameBackground, frameBackgroundImage, framePreset, scenes, subtitleSettings, subtitleText, videoRef])

  const frameStageStyle = useMemo(() => ({
    aspectRatio: `${framePreset.width} / ${framePreset.height}`,
    backgroundColor: getFrameBackgroundFillColor(frameBackground),
    maxWidth: `${Math.round((450 * framePreset.width) / framePreset.height)}px`,
  }), [frameBackground, framePreset.height, framePreset.width])

  return (
    <div className="video-frame-preview">
      <div className="video-frame-stage" style={frameStageStyle}>
        <canvas ref={canvasRef} className="video-frame-canvas" onClick={onTogglePlayback} />
        <video
          ref={videoRef}
          src={videoUrl}
          onLoadedMetadata={onLoadedMetadata}
          onDurationChange={onDurationChange}
          onTimeUpdate={onTimeUpdate}
          onPlay={onPlay}
          onPause={onPause}
          onEnded={onEnded}
          onClick={onTogglePlayback}
          preload="metadata"
          playsInline
        />
        <audio ref={voiceoverRef} src={voiceoverTrack?.previewUrl || undefined} preload="metadata" />
      </div>
    </div>
  )
}