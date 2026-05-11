import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { runNativeExport } from './nativeExportClient';
import { renderFrameCompositionVideo } from './frameCanvasExport';
import { logExportDebug, writeDesktopDebugLog } from './desktopLogger';
import {
  buildFinalMuxArgs,
  getExportTimelineDurationSeconds,
  getVoiceoverExportFileName,
  isAudioMixMuted,
  normalizeExportAudioMix,
} from './exportAudioMix';
import { materializeVoiceoverFile, renderExportAudioTrack } from './exportAudioStage';
import { buildMergedSceneTrack } from './ffmpegSceneMerge';
import { describeFrameBackground, getFramePresetById, sanitizeFrameBackground } from './frameComposer';
import { materializeVideoFile } from './projectStorage';

let ffmpegInstance = null;
let isLoaded = false;
let isLoading = false;

function formatMicroseconds(microseconds) {
  const totalSeconds = Math.max(0, Math.floor((Number(microseconds) || 0) / 1000000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatMegabytes(bytes) {
  return `${(Math.max(0, Number(bytes) || 0) / (1024 * 1024)).toFixed(1)} MB`;
}

function shouldPublishLogLine(message) {
  const normalized = String(message || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return [
    'error',
    'invalid',
    'time=',
    'frame=',
    'size=',
    'duration:',
    'stream mapping',
    'subtitle',
    'opening',
    'video:',
    'audio:',
    'press [q]',
  ].some((token) => normalized.includes(token));
}

function emitExportLog(onProgress, phase, message, level = 'info') {
  void logExportDebug(message, { phase }, level)
  onProgress({
    phase,
    logEntry: {
      phase,
      level,
      message,
      timestamp: Date.now(),
    },
  });
}

async function cleanupMountPoint(ffmpeg, mountPoint) {
  if (!mountPoint) {
    return;
  }

  try {
    await ffmpeg.unmount(mountPoint);
  } catch {
    // Ignore cleanup errors when the mount was not created.
  }

  try {
    await ffmpeg.deleteDir(mountPoint);
  } catch {
    // Ignore cleanup errors when the directory was not created.
  }
}

async function mountInputSource(ffmpeg, sourceVideoFile, onProgress) {
  const mountPoint = '/input-source';
  const inputPath = `${mountPoint}/${sourceVideoFile.name || 'input.mp4'}`;

  emitExportLog(onProgress, 'preparing', `Mount source file ${sourceVideoFile.name || 'input.mp4'} via WORKERFS`);
  onProgress({
    phase: 'preparing',
    percent: 7,
    stagePercent: 40,
    detail: `Đang mount video nguồn • ${formatMegabytes(sourceVideoFile.size)}`,
  });

  await cleanupMountPoint(ffmpeg, mountPoint);
  await ffmpeg.createDir(mountPoint);
  await ffmpeg.mount(FFFSType.WORKERFS, { files: [sourceVideoFile] }, mountPoint);

  onProgress({
    phase: 'preparing',
    percent: 9,
    stagePercent: 60,
    detail: `Đã mount video nguồn • ${sourceVideoFile.name || 'input.mp4'}`,
  });
  emitExportLog(onProgress, 'preparing', `Mounted source file at ${inputPath}`);

  return { mountPoint, inputPath };
}

async function cleanupFiles(ffmpeg, fileNames) {
  for (const fileName of fileNames) {
    try {
      await ffmpeg.deleteFile(fileName);
    } catch {
      // Ignore cleanup errors for files that may not exist.
    }
  }
}

async function runFfmpegStage(ffmpeg, args, { phase, startPercent, endPercent }, onProgress) {
  const progressHandler = ({ progress, time }) => {
    const boundedProgress = Math.max(0, Math.min(1, Number(progress) || 0));
    const percent = startPercent + (endPercent - startPercent) * boundedProgress;
    const stagePercent = Math.round(boundedProgress * 100);
    onProgress({
      phase,
      percent: Math.round(percent),
      stagePercent,
      ffmpegTimeMicroseconds: time || 0,
      detail: `Stage ${stagePercent}% • FFmpeg time ${formatMicroseconds(time)}`,
    });
  };

  const logHandler = ({ message, type }) => {
    const trimmedMessage = String(message || '').trim();
    if (trimmedMessage) {
      void writeDesktopDebugLog({
        scope: 'ffmpeg-raw',
        message: `[${type}] ${trimmedMessage}`,
        data: { phase },
        level: type === 'stderr' ? 'warning' : 'info',
      });
    }

    if (!shouldPublishLogLine(trimmedMessage)) {
      return;
    }

    emitExportLog(onProgress, phase, `[${type}] ${trimmedMessage}`, type === 'stderr' ? 'warning' : 'info');
  };

  ffmpeg.on('progress', progressHandler);
  ffmpeg.on('log', logHandler);
  onProgress({ phase, percent: startPercent });
  emitExportLog(onProgress, phase, `Start ${phase} (${args.length} args)`);
  void logExportDebug(`FFmpeg args for ${phase}`, { args, phase });

  try {
    await ffmpeg.exec(args);
    onProgress({ phase, percent: endPercent });
    emitExportLog(onProgress, phase, `Finish ${phase}`);
  } finally {
    ffmpeg.off('progress', progressHandler);
    ffmpeg.off('log', logHandler);
  }
}

/**
 * Get or create FFmpeg instance, lazy-load WASM core
 * @param {function} onProgress - Loading progress callback (0-100)
 * @returns {Promise<FFmpeg>}
 */
export async function getFFmpeg(onProgress = () => {}) {
  if (isLoaded && ffmpegInstance) {
    return ffmpegInstance;
  }

  if (isLoading) {
    // Wait for existing load to complete
    while (isLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    return ffmpegInstance;
  }

  isLoading = true;
  
  try {
    ffmpegInstance = new FFmpeg();

    const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm';
    void logExportDebug('Begin loading FFmpeg core', { baseURL });
    
    onProgress(10);
    
    await ffmpegInstance.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
    });

    isLoaded = true;
        void logExportDebug('FFmpeg core loaded', { baseURL });
    onProgress(100);
    return ffmpegInstance;
  } catch (error) {
    isLoading = false;
    ffmpegInstance = null;
        void logExportDebug('FFmpeg core failed to load', error, 'error');
    throw error;
  } finally {
    isLoading = false;
  }
}

/**
 * Check if FFmpeg is loaded
 */
export function isFFmpegReady() {
  return isLoaded;
}

/**
 * Export video with selected scenes (remove deleted scenes)
 * 
 * @param {File} inputFile - Original video file
 * @param {Array<{start: number, end: number}>} keptScenes - Scenes to keep (sorted by start time)
 * @param {function} onProgress - Progress callback ({ phase: string, percent: number })
 * @returns {Promise<{blob: Blob, url: string, size: number}>}
 */
export async function exportVideo(inputFile, keptScenes, subtitles, exportOptions = {}, onProgress = () => {}) {
  if (!keptScenes || keptScenes.length === 0) {
    throw new Error('No scenes to export');
  }

  const frameSettings = exportOptions?.frameSettings || exportOptions;
  const normalizedFrameBackground = sanitizeFrameBackground(frameSettings?.backgroundColor);
  const normalizedAudioMix = normalizeExportAudioMix(exportOptions?.audioMix, exportOptions?.voiceoverTrack);
  const timelineDurationSeconds = getExportTimelineDurationSeconds(keptScenes);
  const shouldAttachVoiceover = normalizedAudioMix.hasVoiceoverTrack && !isAudioMixMuted(normalizedAudioMix.voiceoverVolume);
  const voiceoverFile = shouldAttachVoiceover ? await materializeVoiceoverFile(exportOptions?.voiceoverTrack) : null;

  try {
    emitExportLog(onProgress, 'preparing', 'Attempt native fast export backend');
    return await runNativeExport({
      inputFile,
      keptScenes,
      subtitles,
      audioMix: normalizedAudioMix,
      frameSettings: {
        ...frameSettings,
        backgroundColor: normalizedFrameBackground,
      },
      voiceoverFile,
      voiceoverTrack: exportOptions?.voiceoverTrack || null,
    }, onProgress);
  } catch (error) {
    emitExportLog(
      onProgress,
      'preparing',
      `Native fast export unavailable, fallback to renderer export: ${error.message}`,
      'warning',
    );
    void logExportDebug('Fallback to renderer export backend', {
      audioMix: normalizedAudioMix,
      code: error?.code || 'NATIVE_EXPORT_FAILED',
      frameBackground: describeFrameBackground(normalizedFrameBackground),
      message: error?.message || 'Unknown native export error',
    }, 'warning');
  }

  const ffmpeg = await getFFmpeg((p) => onProgress({ phase: 'loading', percent: p }));

  onProgress({ phase: 'preparing', percent: 0, stagePercent: 0, detail: 'Khởi tạo export...' });

  let inputMountPoint = null;
  const transientFiles = [];

  try {
    onProgress({ phase: 'preparing', percent: 2, stagePercent: 10, detail: 'Đang lấy video nguồn...' });
    emitExportLog(onProgress, 'preparing', 'Resolve source video object');
    const sourceVideoFile = await materializeVideoFile(inputFile);
    if (!sourceVideoFile) {
      throw new Error('Không thể truy cập video nguồn để export.');
    }

    onProgress({
      phase: 'preparing',
      percent: 4,
      stagePercent: 20,
      detail: `Đã lấy video nguồn • ${formatMegabytes(sourceVideoFile.size)}`,
    });
    emitExportLog(onProgress, 'preparing', `Resolved source file (${formatMegabytes(sourceVideoFile.size)})`);

    const mountedInput = await mountInputSource(ffmpeg, sourceVideoFile, onProgress);
    inputMountPoint = mountedInput.mountPoint;

    const framePreset = getFramePresetById(frameSettings?.presetId);
    onProgress({
      phase: 'preparing',
      percent: 10,
      stagePercent: 80,
      detail: `Chuẩn bị ${keptScenes.length} cảnh • ${subtitles?.length || 0} subtitle`,
      sceneCount: keptScenes.length,
      subtitleCount: subtitles?.length || 0,
    });
    emitExportLog(onProgress, 'preparing', `Prepared ${keptScenes.length} kept scenes`);
    if (Array.isArray(subtitles) && subtitles.length > 0) {
      emitExportLog(onProgress, 'preparing', `Prepared ${subtitles.length} subtitle events for frame recorder`);
    }
    
    onProgress({ phase: 'cutting', percent: 10 });

    if (keptScenes.length === 1) {
      // Single scene — re-encode to ensure precise keyframe cut and no stuttering
      const scene = keptScenes[0];
      await runFfmpegStage(ffmpeg, [
        '-ss', String(scene.start),
        '-i', mountedInput.inputPath,
        '-t', String(scene.duration),
        '-c:v', 'libx264',
        '-threads', '1',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-c:a', 'aac',
        '-avoid_negative_ts', '1',
        'cut.mp4'
      ], {
        phase: 'cutting',
        startPercent: 10,
        endPercent: 45,
      }, onProgress);
    } else {
      await buildMergedSceneTrack({
        ffmpeg,
        inputPath: mountedInput.inputPath,
        keptScenes,
        runStage: runFfmpegStage,
        onProgress,
        emitLog: emitExportLog,
        transientFiles,
      });
    }

    emitExportLog(onProgress, 'framing', 'Read cut.mp4 for record-frame compositor');
    const cutVideoData = await ffmpeg.readFile('cut.mp4');
    const cutVideoBlob = new Blob([cutVideoData], { type: 'video/mp4' });
    const recordedFrameResult = await renderFrameCompositionVideo({
      sourceVideoBlob: cutVideoBlob,
      subtitles: subtitles || [],
      framePreset,
      frameBackground: normalizedFrameBackground,
      subtitleSettings: exportOptions?.subtitleSettings || null,
      onProgress,
      onLog: (message) => emitExportLog(onProgress, 'framing', message),
    });
    const framedVideoPath = 'framed-preview.webm';
    transientFiles.push(framedVideoPath);
    await ffmpeg.writeFile(framedVideoPath, new Uint8Array(await recordedFrameResult.blob.arrayBuffer()));
    emitExportLog(onProgress, 'framing', `Recorded preview compositor to ${framedVideoPath}`);

    const needsAudioRemix = shouldAttachVoiceover
      || isAudioMixMuted(normalizedAudioMix.videoVolume)
      || Math.abs(normalizedAudioMix.videoVolume - 1) > 0.001;
    let finalAudioPath = 'cut.mp4';

    if (needsAudioRemix) {
      let voiceoverInputPath = '';

      if (voiceoverFile) {
        voiceoverInputPath = getVoiceoverExportFileName(voiceoverFile.name);
        transientFiles.push(voiceoverInputPath);
        await ffmpeg.writeFile(voiceoverInputPath, new Uint8Array(await voiceoverFile.arrayBuffer()));
        emitExportLog(onProgress, 'audio', `Prepared voiceover input ${voiceoverInputPath}`);
      }

      finalAudioPath = await renderExportAudioTrack({
        normalizedAudioMix,
        timelineDurationSeconds,
        voiceoverInputPath,
        voiceoverTrack: exportOptions?.voiceoverTrack,
        runStage: (args, progressConfig) => runFfmpegStage(ffmpeg, args, progressConfig, onProgress),
        emitLog: (phase, message, level = 'info') => emitExportLog(onProgress, phase, message, level),
        cleanupFiles: (fileNames) => cleanupFiles(ffmpeg, fileNames),
      });

      if (finalAudioPath) {
        transientFiles.push(finalAudioPath);
      }
    }

    await runFfmpegStage(
      ffmpeg,
      buildFinalMuxArgs({
        frameVideoPath: framedVideoPath,
        audioPath: finalAudioPath,
        timelineDurationSeconds,
        outputPath: 'output.mp4',
        optionalAudio: !needsAudioRemix,
      }),
      {
        phase: needsAudioRemix ? 'audio' : 'framing',
        startPercent: needsAudioRemix ? 88 : 82,
        endPercent: needsAudioRemix ? 92 : 88,
      },
      onProgress,
    );

    onProgress({ phase: 'reading', percent: 94 });
    emitExportLog(onProgress, 'reading', 'Read output.mp4 from FFmpeg worker');

    // Read output
    const outputData = await ffmpeg.readFile('output.mp4');
    const blob = new Blob([outputData], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);

    // Cleanup
    await cleanupFiles(ffmpeg, ['cut.mp4', 'output.mp4', ...transientFiles].filter(Boolean));
    await cleanupMountPoint(ffmpeg, inputMountPoint);

    onProgress({ phase: 'done', percent: 100 });
    emitExportLog(onProgress, 'done', `Export completed (${Math.round(blob.size / 1024)} KB)`);

    return { blob, url, size: blob.size };
  } catch (error) {
    // Cleanup on error
    await cleanupFiles(ffmpeg, ['cut.mp4', 'output.mp4', ...transientFiles]);
    await cleanupMountPoint(ffmpeg, inputMountPoint);
    emitExportLog(onProgress, 'error', error.message, 'error');
    throw error;
  }
}
