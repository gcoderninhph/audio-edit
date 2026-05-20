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
import { frameSourceTimelineVideo } from './framePipeline.mjs'
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
import { getNativeEncodePlan, runNativeFfmpeg } from './nativeFfmpeg.mjs'

async function runNativeExportJob(sender, payload = {}) {
  const jobId = payload.jobId || `native-export-${Date.now()}`
  const jobDirectory = buildJobDirectory(jobId)
  const framePreset = resolveFramePreset(payload.frameSettings)
  const frameBackground = sanitizeFrameBackground(payload.frameSettings?.backgroundColor)
  const hideWatermark = Boolean(payload.frameSettings?.hideWatermark)
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
    const wantsVideoAudio = !isAudioMixMuted(normalizedAudioMix.videoVolume)
    const wantsVoiceoverAudio = Boolean(voiceoverPath) && !isAudioMixMuted(normalizedAudioMix.voiceoverVolume)
    const needsAudioRender = wantsVideoAudio || wantsVoiceoverAudio
    const framedVideoPath = needsAudioRender ? path.join(jobDirectory, 'framed-output.mp4') : outputTarget.filePath

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

    emitLog(sender, jobId, 'preparing', 'Skip intermediate scene cut and merge; encode directly from source timeline', 'info', {
      percent: 12,
      stagePercent: 100,
      detail: 'Dùng timeline trực tiếp, bỏ bước cắt/gộp scene trung gian',
    }, {
      keptSceneCount: keptScenes.length,
      timelineDurationSeconds,
    })

    const encoderPlan = await getNativeEncodePlan(exportQualityProfileId)
    const runHybridAudioStage = needsAudioRender && encoderPlan.hardware

    if (runHybridAudioStage) {
      emitLog(sender, jobId, 'preparing', 'Run hybrid export pipeline: GPU video encode with parallel CPU audio rendering', 'info', {
        percent: 14,
        stagePercent: 100,
        detail: `Hybrid export: ${encoderPlan.label} encode + CPU audio mix song song`,
      }, {
        encoder: encoderPlan.label,
        hardware: true,
        parallelAudio: true,
      })
    } else if (needsAudioRender) {
      emitLog(sender, jobId, 'preparing', 'Audio render will run after frame encode because no verified GPU encoder is active', 'info', {
        percent: 14,
        stagePercent: 100,
        detail: `Khong co GPU encoder kha dung, giu audio stage chay sau ${encoderPlan.label}`,
      }, {
        encoder: encoderPlan.label,
        hardware: false,
        parallelAudio: false,
      })
    }

    const frameRenderPromise = frameSourceTimelineVideo({
      sender,
      jobId,
      jobDirectory,
      inputPath,
      outputPath: framedVideoPath,
      exportQualityProfileId,
      encoderPlan,
      keptScenes,
      framePreset,
      frameBackground: nativeFrameBackground,
      hideWatermark,
      overlayAssets,
      emitLog,
      emitProgress,
    })
    const audioRenderPromise = runHybridAudioStage
      ? renderNativeExportAudioTrack({
        sender,
        jobId,
        emitLog,
        emitProgress,
        jobDirectory,
        inputPath,
        keptScenes,
        voiceoverPath,
        voiceoverTrack: payload.voiceover,
        normalizedAudioMix,
        timelineDurationSeconds,
        emitProgressUpdates: false,
      })
      : null

    const [{ outputPath, encoderPlan: resolvedEncoderPlan }, mixedAudioFromHybrid = null] = await Promise.all([
      frameRenderPromise,
      audioRenderPromise,
    ])
    let finalOutputPath = outputPath
    let mixedAudioPath = mixedAudioFromHybrid

    if (needsAudioRender) {
      if (!runHybridAudioStage) {
        mixedAudioPath = await renderNativeExportAudioTrack({
          sender,
          jobId,
          emitLog,
          emitProgress,
          jobDirectory,
          inputPath,
          keptScenes,
          voiceoverPath,
          voiceoverTrack: payload.voiceover,
          normalizedAudioMix,
          timelineDurationSeconds,
        })
      }
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
      encoder: resolvedEncoderPlan.label,
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