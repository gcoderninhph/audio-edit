import { drawFrameComposition, loadFrameBackgroundImage } from './frameCanvasRenderer'
import { DEFAULT_SUBTITLE_FONT_FAMILY, DEFAULT_SUBTITLE_SETTINGS } from './subtitleRenderModel'

function waitForEvent(target, eventName) {
  return new Promise((resolve, reject) => {
    const handleSuccess = () => {
      cleanup()
      resolve()
    }
    const handleError = (event) => {
      cleanup()
      reject(event instanceof Error ? event : new Error(`Failed during ${eventName}`))
    }
    const cleanup = () => {
      target.removeEventListener(eventName, handleSuccess)
      target.removeEventListener('error', handleError)
    }

    target.addEventListener(eventName, handleSuccess, { once: true })
    target.addEventListener('error', handleError, { once: true })
  })
}

function getActiveSubtitleText(subtitles, currentTime) {
  return subtitles.find((subtitle) => currentTime >= subtitle.start && currentTime <= subtitle.end)?.text || ''
}

function getRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined') {
    return ''
  }

  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]

  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || ''
}

export async function renderFrameCompositionVideo({
  sourceVideoBlob,
  subtitles,
  framePreset,
  frameBackground,
  onProgress,
  onLog,
  fontFamily = DEFAULT_SUBTITLE_FONT_FAMILY,
  recordingVideoBitsPerSecond = 10_000_000,
  subtitleSettings = DEFAULT_SUBTITLE_SETTINGS,
}) {
  const sourceVideoUrl = URL.createObjectURL(sourceVideoBlob)
  const videoElement = document.createElement('video')
  const canvasElement = document.createElement('canvas')
  const canvasContext = canvasElement.getContext('2d', { alpha: false })
  const backgroundImage = await loadFrameBackgroundImage(frameBackground)

  if (!canvasContext) {
    throw new Error('Unable to initialize the canvas renderer for export.')
  }

  canvasElement.width = framePreset.width
  canvasElement.height = framePreset.height

  videoElement.src = sourceVideoUrl
  videoElement.muted = true
  videoElement.playsInline = true
  videoElement.preload = 'auto'
  videoElement.crossOrigin = 'anonymous'

  const stream = canvasElement.captureStream(0)
  const streamTrack = stream.getVideoTracks()[0]
  const recorderMimeType = getRecorderMimeType()
  const resolvedVideoBitsPerSecond = Math.max(1, Number(recordingVideoBitsPerSecond) || 10_000_000)
  const recorder = recorderMimeType
    ? new MediaRecorder(stream, { mimeType: recorderMimeType, videoBitsPerSecond: resolvedVideoBitsPerSecond })
    : new MediaRecorder(stream)
  const chunks = []

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data)
    }
  }

  await waitForEvent(videoElement, 'loadedmetadata')

  drawFrameComposition(canvasContext, {
    framePreset,
    frameBackground,
    backgroundImage,
    videoElement,
    subtitleText: getActiveSubtitleText(subtitles, 0),
    fontFamily,
    subtitleSettings,
  })
  streamTrack?.requestFrame?.()

  const completionPromise = new Promise((resolve, reject) => {
    recorder.onerror = (event) => reject(event.error || new Error('Canvas recorder failed during export.'))
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }))
    }
  })

  let frameCallbackHandle = null
  const paintCurrentFrame = () => {
    drawFrameComposition(canvasContext, {
      framePreset,
      frameBackground,
      backgroundImage,
      videoElement,
      subtitleText: getActiveSubtitleText(subtitles, videoElement.currentTime),
      fontFamily,
      subtitleSettings,
    })
    streamTrack?.requestFrame?.()

    const duration = Math.max(videoElement.duration || 0, 0.001)
    const boundedProgress = Math.max(0, Math.min(1, videoElement.currentTime / duration))
    onProgress?.({
      phase: 'framing',
      percent: Math.round(72 + (boundedProgress * 10)),
      stagePercent: Math.round(boundedProgress * 100),
      detail: `Recording preview frames • ${Math.round(boundedProgress * 100)}%`,
    })
  }

  if ('requestVideoFrameCallback' in videoElement) {
    const pumpFrames = () => {
      paintCurrentFrame()
      if (videoElement.ended) {
        return
      }
      frameCallbackHandle = videoElement.requestVideoFrameCallback(() => pumpFrames())
    }

    frameCallbackHandle = videoElement.requestVideoFrameCallback(() => pumpFrames())
  }

  recorder.start(250)
  onLog?.('Start record-frame compositor from preview renderer')
  await videoElement.play()
  await waitForEvent(videoElement, 'ended')

  if (typeof videoElement.cancelVideoFrameCallback === 'function' && frameCallbackHandle !== null) {
    videoElement.cancelVideoFrameCallback(frameCallbackHandle)
  }

  paintCurrentFrame()
  recorder.stop()
  const recordedBlob = await completionPromise

  URL.revokeObjectURL(sourceVideoUrl)
  stream.getTracks().forEach((track) => track.stop())

  return {
    blob: recordedBlob,
    mimeType: recorder.mimeType || 'video/webm',
  }
}