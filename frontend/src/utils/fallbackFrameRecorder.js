import { renderFrameCompositionVideo } from './frameCanvasExport'
import { buildSceneMotionSegments } from './sceneMotion'

export async function recordFallbackFrameComposition({
  emitExportLog,
  exportQualityProfile,
  ffmpeg,
  frameBackground,
  framePreset,
  hideWatermark = false,
  keptScenes,
  onProgress,
  subtitles,
  subtitleSettings,
}) {
  emitExportLog(onProgress, 'framing', 'Read cut.mp4 for record-frame compositor')
  const cutVideoData = await ffmpeg.readFile('cut.mp4')
  const cutVideoBlob = new Blob([cutVideoData], { type: 'video/mp4' })
  const recordedFrameResult = await renderFrameCompositionVideo({
    sourceVideoBlob: cutVideoBlob,
    subtitles: subtitles || [],
    framePreset,
    frameBackground,
    hideWatermark,
    recordingVideoBitsPerSecond: exportQualityProfile.recorderVideoBitsPerSecond,
    sceneMotionSegments: buildSceneMotionSegments(keptScenes),
    subtitleSettings,
    onProgress,
    onLog: (message) => emitExportLog(onProgress, 'framing', message),
  })
  const framedVideoPath = 'framed-preview.webm'
  await ffmpeg.writeFile(framedVideoPath, new Uint8Array(await recordedFrameResult.blob.arrayBuffer()))
  emitExportLog(onProgress, 'framing', `Recorded preview compositor to ${framedVideoPath}`)

  return framedVideoPath
}
