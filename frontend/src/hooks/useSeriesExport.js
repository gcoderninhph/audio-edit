import { useCallback, useState } from 'react';
import { exportSeriesEpisodes } from '../utils/seriesExportPipeline';
import { chooseExportOutputDirectory, getDefaultExportDirectory } from '../utils/exportOutputTarget';
import { DEFAULT_EXPORT_QUALITY_PROFILE_ID, normalizeExportQualityProfileId } from '../utils/exportQualityProfile';
import { normalizeEpisodeNumber } from '../components/ProjectDashboard/projectDashboardModel';

function createInitialProgress() {
  return {
    phase: 'idle',
    percent: 0,
    episodeIndex: 0,
    episodeTotal: 0,
    detail: '',
    logs: [],
  };
}

function mergeProgress(current, update) {
  const nextLogs = [...(current.logs || [])];
  if (update.detail) {
    nextLogs.push({
      phase: update.phase || 'info',
      level: update.level || 'info',
      message: update.detail,
      timestamp: Date.now(),
    });
  }

  return {
    ...current,
    ...update,
    logs: nextLogs.slice(-120),
  };
}

export default function useSeriesExport(seriesName = 'series', { hideWatermark = false } = {}) {
  const [qualityProfileId, setQualityProfileId] = useState(DEFAULT_EXPORT_QUALITY_PROFILE_ID);
  const [outputDirectory, setOutputDirectory] = useState('');
  const [outputFileName, setOutputFileName] = useState(() => {
    const safe = String(seriesName || 'series').replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_') || 'series';
    return `${safe}_export`;
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(createInitialProgress);
  const [exportResult, setExportResult] = useState(null);

  const resetExport = useCallback(() => {
    setExportProgress(createInitialProgress());
    setExportResult(null);
  }, []);

  const chooseDirectory = useCallback(async () => {
    const chosen = await chooseExportOutputDirectory();
    if (chosen) {
      setOutputDirectory(chosen);
    }
  }, []);

  const ensureOutputDirectory = useCallback(async () => {
    if (outputDirectory) return outputDirectory;
    const defaultDir = await getDefaultExportDirectory();
    if (defaultDir) setOutputDirectory(defaultDir);
    return defaultDir || '';
  }, [outputDirectory]);

  const startSeriesExport = useCallback(async (seriesProjects) => {
    if (isExporting) return;

    const sorted = [...(seriesProjects || [])]
      .sort((a, b) => normalizeEpisodeNumber(a.episode_number) - normalizeEpisodeNumber(b.episode_number));

    if (sorted.length === 0) return;

    const resolvedDirectory = await ensureOutputDirectory();
    const resolvedProfileId = normalizeExportQualityProfileId(qualityProfileId);

    setIsExporting(true);
    setExportResult(null);
    setExportProgress({
      ...createInitialProgress(),
      phase: 'episode',
      episodeTotal: sorted.length,
      detail: `Starting series export for ${sorted.length} episode(s)...`,
      logs: [{
        phase: 'episode',
        level: 'info',
        message: `Series export started — ${sorted.length} episodes, quality: ${resolvedProfileId}`,
        timestamp: Date.now(),
      }],
    });

    try {
      const result = await exportSeriesEpisodes(
        sorted,
        {
          hideWatermark,
          qualityProfileId: resolvedProfileId,
          outputDirectory: resolvedDirectory,
          outputFileName,
        },
        (update) => setExportProgress((prev) => mergeProgress(prev, update)),
      );

      setExportResult(result);
    } catch (error) {
      setExportProgress((prev) => mergeProgress(prev, {
        phase: 'error',
        percent: prev.percent,
        detail: error.message || 'Series export failed',
        level: 'error',
      }));
    } finally {
      setIsExporting(false);
    }
  }, [hideWatermark, isExporting, ensureOutputDirectory, qualityProfileId, outputFileName]);

  return {
    qualityProfileId,
    setQualityProfileId,
    outputDirectory,
    outputFileName,
    setOutputFileName,
    chooseDirectory,
    isExporting,
    exportProgress,
    exportResult,
    resetExport,
    startSeriesExport,
  };
}
