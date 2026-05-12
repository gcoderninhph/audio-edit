import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  buildFinalMuxArgs,
  getExportTimelineDurationSeconds,
  isAudioMixMuted,
  normalizeExportAudioMix,
} from '../../src/utils/exportAudioMix.js'
import { describeFrameBackground, sanitizeFrameBackground } from '../../src/utils/frameComposer.js'
import { renderNativeExportAudioTrack } from './exportAudioStage.mjs'
import { resolveExportOutputTarget } from './exportOutputIpc.mjs'
import { frameMergedVideo } from './framePipeline.mjs'
import {
  buildJobDirectory,
  cleanupJobDirectory,
  clearDetachedRendererJob,
  createExportError,
  emitLog,
  emitProgress,
  formatMegabytes,
  resolveFramePreset,
  resolveInputPath,
  sanitizeFileName,
  writeFrameBackgroundAsset,
  writeOverlayAssets,
} from './nativeExportJobHelpers.mjs'
import { runNativeFfmpeg } from './nativeFfmpeg.mjs'
import { extractSceneSegments, mergeSceneSegments } from './scenePipeline.mjs'

async function runNativeExportJob(sender, payload = {}) {
  const jobId = payload.jobId || `native-export-${Date.now()}`
  const jobDirectory = buildJobDirectory(jobId)
  const framePreset = resolveFramePreset(payload.frameSettings)
  const frameBackground = sanitizeFrameBackground(payload.frameSettings?.backgroundColor)
  const exportQualityProfileId = payload.exportQualityProfileId || null
  const outputTarget = resolveExportOutputTarget(payload.outputTarget, payload.source?.fileName || 'output.mp4')
  const keptScenes = Array.isArray(payload.keptScenes)
    ? payload.keptScenes
      .map((scene) => ({
        ...scene,
        duration: Math.max(0, Number(scene.duration) || (Number(scene.end) || 0) - (Number(scene.start) || 0)),
        start: Math.max(0, Number(scene.start) || 0),
        end: Math.max(0, Number(scene.end) || 0),
      }))
      .filter((scene) => scene.duration > 0)
    : []
  const normalizedAudioMix = normalizeExportAudioMix(payload.audioMix, payload.voiceover)
  const timelineDurationSeconds = getExportTimelineDurationSeconds(keptScenes)

  if (keptScenes.length === 0) {
    throw createExportError('No kept scenes were provided for native export.', 'NATIVE_EXPORT_INVALID_INPUT')
  }

  emitProgress(sender, jobId, {
    phase: 'preparing',
    percent: 0,
    stagePercent: 0,
    detail: 'Khởi tạo native fast export...',
  })

  await mkdir(jobDirectory, { recursive: true })

  try {
    const { inputPath } = await resolveInputPath(payload.source, jobDirectory)
    const { inputPath: voiceoverPath = '' } = payload.voiceover?.source
      ? await resolveInputPath(payload.voiceover.source, jobDirectory)
      : { inputPath: '' }
    const needsAudioRemix = Boolean(voiceoverPath) && !isAudioMixMuted(normalizedAudioMix.voiceoverVolume)
      || isAudioMixMuted(normalizedAudioMix.videoVolume)
      || Math.abs(normalizedAudioMix.videoVolume - 1) > 0.001
    const framedVideoPath = needsAudioRemix ? path.join(jobDirectory, 'framed-output.mp4') : outputTarget.filePath

    await mkdir(outputTarget.directory, { recursive: true })

    const nativeFrameBackground = await writeFrameBackgroundAsset(jobDirectory, frameBackground)
    const overlayAssets = await writeOverlayAssets(jobDirectory, payload.subtitleOverlay)
    emitLog(sender, jobId, 'preparing', 'Resolved native export inputs', 'info', {
      percent: 8,
      stagePercent: 40,
      detail: `Nguồn: ${sanitizeFileName(path.basename(inputPath))} • ${overlayAssets.length} overlay`,
    }, {
      audioMix: normalizedAudioMix,
      frameBackground: describeFrameBackground(frameBackground),
      framePreset: {
        id: framePreset.id,
        label: framePreset.label,
        width: framePreset.width,
        height: framePreset.height,
        requestedPresetId: payload.frameSettings?.presetId || null,
      },
      inputPath,
      overlayCount: overlayAssets.length,
      outputPath: outputTarget.filePath,
      voiceoverPath: voiceoverPath || null,
    })

    const segmentPaths = await extractSceneSegments({
      sender,
      emitLog,
      emitProgress,
      jobId,
      inputPath,
      jobDirectory,
      keptScenes,
    })
    const mergedPath = await mergeSceneSegments({
      sender,
      emitLog,
      emitProgress,
      jobId,
      jobDirectory,
      segmentPaths,
    })
    const { outputPath, encoderPlan } = await frameMergedVideo({
      sender,
      jobId,
      jobDirectory,
      mergedPath,
      outputPath: framedVideoPath,
      exportQualityProfileId,
      keptScenes,
      framePreset,
      frameBackground: nativeFrameBackground,
      overlayAssets,
      emitLog,
      emitProgress,
    })
    let finalOutputPath = outputPath

    if (needsAudioRemix) {
      const mixedAudioPath = await renderNativeExportAudioTrack({
        sender,
        jobId,
        emitLog,
        emitProgress,
        jobDirectory,
        mergedPath,
        voiceoverPath,
        voiceoverTrack: payload.voiceover,
        normalizedAudioMix,
        timelineDurationSeconds,
      })
      const remuxedOutputPath = outputTarget.filePath

      emitLog(sender, jobId, 'audio', 'Remux framed video with configured export audio', 'info', {
        percent: 99,
        stagePercent: 50,
        detail: 'Dang ghep video khung voi audio export',
      }, {
        mixedAudioPath: mixedAudioPath || null,
      })

      await runNativeFfmpeg(buildFinalMuxArgs({
        frameVideoPath: outputPath,
        audioPath: mixedAudioPath || '',
        timelineDurationSeconds,
        outputPath: remuxedOutputPath,
        copyVideo: true,
      }), { cwd: jobDirectory })
      finalOutputPath = remuxedOutputPath
    }

    emitProgress(sender, jobId, {
      phase: 'saving',
      percent: 99,
      stagePercent: 0,
      detail: `Saving export to ${outputTarget.fileName}...`,
    })

    const outputStats = await stat(finalOutputPath)
    emitLog(sender, jobId, 'done', `Native export completed (${formatMegabytes(outputStats.size)})`, 'info', {
      percent: 100,
      stagePercent: 100,
      detail: `Saved native export to ${outputTarget.fileName}`,
    }, {
      encoder: encoderPlan.label,
      outputPath: finalOutputPath,
    })

    return {
      backend: 'native-fast',
      fileName: outputTarget.fileName,
      filePath: finalOutputPath,
      mimeType: 'video/mp4',
      size: outputStats.size,
    }
  } catch (error) {
    emitLog(sender, jobId, 'error', error.message, 'error', {}, {
      code: error.code || 'NATIVE_EXPORT_FAILED',
    })
    throw error
  } finally {
    clearDetachedRendererJob(jobId)
    await cleanupJobDirectory(jobDirectory, jobId)
  }
}

export function registerNativeExportIpc(ipcMain) {
  ipcMain.handle('native-export:run', async (event, payload) => runNativeExportJob(event.sender, payload))
}