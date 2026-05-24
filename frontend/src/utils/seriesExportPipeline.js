import { getFFmpeg } from './ffmpegManager';
import { exportVideo } from './ffmpegManager';
import { getLocalProject, getLocalProjectVideoReference, materializeLocalProjectVoiceover } from './projectStorage';
import { saveExportBytesToFile, getExportFileNameLabel } from './exportOutputTarget';
import { DEFAULT_FRAME_PRESET_ID, DEFAULT_FRAME_BACKGROUND } from './frameComposer';
import { DEFAULT_SUBTITLE_SETTINGS, normalizeSubtitleSettings } from './subtitleRenderModel';
import { DEFAULT_SUBTITLE_LANGUAGE_KEY, getSubtitlesForLanguage, normalizeActiveSubtitleLanguage } from './subtitleTracks';

async function loadEpisodeExportData(projectId, { hideWatermark = false } = {}) {
  const [fullProject, videoRef, voiceoverData] = await Promise.all([
    getLocalProject(projectId),
    getLocalProjectVideoReference(projectId),
    materializeLocalProjectVoiceover(projectId),
  ]);

  if (!videoRef) {
    return null;
  }

  const deletedSet = new Set(Array.isArray(fullProject?.deleted_ids) ? fullProject.deleted_ids : []);
  const allScenes = Array.isArray(fullProject?.scenes) ? fullProject.scenes : [];
  const keptScenes = allScenes.filter((scene) => !deletedSet.has(scene.id));

  if (keptScenes.length === 0) {
    return null;
  }

  const activeLanguage = normalizeActiveSubtitleLanguage(
    fullProject?.active_subtitle_language || DEFAULT_SUBTITLE_LANGUAGE_KEY,
    fullProject?.subtitle_tracks,
  );
  const subtitles = getSubtitlesForLanguage(fullProject?.subtitle_tracks, activeLanguage);

  const voiceoverTrack = voiceoverData
    ? {
      duration: voiceoverData.duration || 0,
      fileName: voiceoverData.fileName || 'voiceover.mp3',
      languageKey: voiceoverData.languageKey || activeLanguage,
      mimeType: voiceoverData.mimeType || 'audio/mpeg',
      previewUrl: voiceoverData.previewUrl,
      startTime: 0,
    }
    : null;

  return {
    projectId,
    videoSource: {
      kind: 'stored-project-video',
      projectId,
      name: videoRef.name,
      type: videoRef.mimeType,
      size: 0,
      url: videoRef.url,
    },
    keptScenes,
    subtitles,
    frameSettings: {
      presetId: fullProject?.frame_preset_id || DEFAULT_FRAME_PRESET_ID,
      backgroundColor: fullProject?.frame_background || DEFAULT_FRAME_BACKGROUND,
      hideWatermark,
    },
    subtitleSettings: normalizeSubtitleSettings(fullProject?.subtitle_settings || DEFAULT_SUBTITLE_SETTINGS),
    audioMix: fullProject?.export_audio_mix || {},
    voiceoverTrack,
  };
}

async function concatEpisodeBlobs(blobs, onProgress) {
  if (blobs.length === 1) {
    return blobs[0];
  }

  const ffmpeg = await getFFmpeg((p) => onProgress({ percent: 82 + Math.round(p * 0.02) }));
  const episodeFiles = [];

  for (let i = 0; i < blobs.length; i++) {
    const fileName = `series-ep-${String(i + 1).padStart(3, '0')}.mp4`;
    episodeFiles.push(fileName);
    const bytes = new Uint8Array(await blobs[i].arrayBuffer());
    await ffmpeg.writeFile(fileName, bytes);
    onProgress({ percent: 84 + Math.round((i / blobs.length) * 5), detail: `Preparing episode ${i + 1}/${blobs.length} for concatenation` });
  }

  const manifest = episodeFiles.map((f) => `file '${f}'`).join('\n') + '\n';
  await ffmpeg.writeFile('series-concat.txt', new TextEncoder().encode(manifest));

  onProgress({ percent: 90, detail: `Running FFmpeg concat on ${blobs.length} episodes...` });
  await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'series-concat.txt', '-c', 'copy', 'series-output.mp4']);
  onProgress({ percent: 95, detail: 'Reading concatenated output...' });

  const outputData = await ffmpeg.readFile('series-output.mp4');
  const outputBlob = new Blob([outputData], { type: 'video/mp4' });

  const cleanupFiles = [...episodeFiles, 'series-concat.txt', 'series-output.mp4'];
  for (const f of cleanupFiles) {
    try { await ffmpeg.deleteFile(f); } catch { /* ignore cleanup errors */ }
  }

  return outputBlob;
}

export async function exportSeriesEpisodes(sortedEpisodes, exportConfig, onProgress) {
  if (!sortedEpisodes || sortedEpisodes.length === 0) {
    throw new Error('No episodes provided for series export.');
  }

  const blobs = [];
  const skipped = [];

  for (let i = 0; i < sortedEpisodes.length; i++) {
    const episode = sortedEpisodes[i];
    const episodeLabel = `Episode ${i + 1}/${sortedEpisodes.length}`;

    onProgress({
      phase: 'episode',
      episodeIndex: i,
      episodeTotal: sortedEpisodes.length,
      percent: Math.round((i / sortedEpisodes.length) * 80),
      detail: `Loading ${episodeLabel}...`,
    });

    const episodeData = await loadEpisodeExportData(episode.id, {
      hideWatermark: Boolean(exportConfig?.hideWatermark),
    });
    if (!episodeData) {
      skipped.push(i + 1);
      onProgress({
        phase: 'episode',
        episodeIndex: i,
        episodeTotal: sortedEpisodes.length,
        percent: Math.round(((i + 0.5) / sortedEpisodes.length) * 80),
        detail: `${episodeLabel} skipped — no video file or scene data`,
        level: 'warning',
      });
      continue;
    }

    const episodeStart = Math.round((i / sortedEpisodes.length) * 80);
    const episodeEnd = Math.round(((i + 1) / sortedEpisodes.length) * 80);

    onProgress({
      phase: 'episode',
      episodeIndex: i,
      episodeTotal: sortedEpisodes.length,
      percent: episodeStart,
      detail: `Exporting ${episodeLabel} (${episodeData.keptScenes.length} scenes)...`,
    });

    const result = await exportVideo(
      episodeData.videoSource,
      episodeData.keptScenes,
      episodeData.subtitles,
      {
        exportQualityProfileId: exportConfig.qualityProfileId,
        frameSettings: episodeData.frameSettings,
        frameRate: exportConfig.frameRate,
        subtitleSettings: episodeData.subtitleSettings,
        audioMix: episodeData.audioMix,
        hideWatermark: Boolean(exportConfig?.hideWatermark),
        voiceoverTrack: episodeData.voiceoverTrack,
      },
      (update) => {
        const scaled = episodeStart + Math.round(((update.percent || 0) / 100) * (episodeEnd - episodeStart));
        onProgress({
          ...update,
          phase: 'episode',
          episodeIndex: i,
          episodeTotal: sortedEpisodes.length,
          percent: scaled,
          detail: `[${episodeLabel}] ${update.detail || update.phase || ''}`,
        });
      },
    );

    if (result.blob) {
      blobs.push(result.blob);
    }

    if (episodeData.voiceoverTrack?.previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(episodeData.voiceoverTrack.previewUrl);
    }
  }

  if (blobs.length === 0) {
    throw new Error(
      skipped.length > 0
        ? `All episodes were skipped (episodes ${skipped.join(', ')} had no video or scene data).`
        : 'No episodes were successfully exported.',
    );
  }

  onProgress({ phase: 'concat', percent: 82, detail: `Joining ${blobs.length} episode(s)...`, episodeTotal: sortedEpisodes.length });

  const concatBlob = await concatEpisodeBlobs(blobs, (update) => onProgress({ ...update, phase: 'concat' }));

  onProgress({ phase: 'saving', percent: 96, detail: 'Writing series output file...' });

  const savedResult = await saveExportBytesToFile({
    bytes: new Uint8Array(await concatBlob.arrayBuffer()),
    fallbackFileName: getExportFileNameLabel(exportConfig.outputFileName || 'series_output'),
    outputTarget: {
      directory: exportConfig.outputDirectory || '',
      fileName: exportConfig.outputFileName || 'series_output',
    },
  });

  onProgress({ phase: 'done', percent: 100, detail: `Series saved to ${savedResult.fileName}` });

  return {
    savedFileName: savedResult.fileName,
    savedFilePath: savedResult.filePath,
    size: savedResult.size,
    skippedEpisodes: skipped,
  };
}
