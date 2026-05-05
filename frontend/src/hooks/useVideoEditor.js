import { useState, useCallback, useMemo, useRef } from 'react';
import { detectScenes, generateThumbnail } from '../utils/sceneDetection';
import { exportVideo, isFFmpegReady, getFFmpeg } from '../utils/ffmpegManager';
import { transcribeVideo } from '../utils/audioExtractor';
import { translateSubtitles } from '../utils/subtitleUtils';

export function useVideoEditor() {
  // ── Video State ──
  const [videoFile, setVideoFileState] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoName, setVideoName] = useState('');

  // ── Scene Detection ──
  const [scenes, setScenes] = useState([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectProgress, setDetectProgress] = useState(0);
  const [sensitivity, setSensitivity] = useState(2.5);

  // ── Scene Management ──
  const [deletedSceneIds, setDeletedSceneIds] = useState(new Set());

  // ── Thumbnails ──
  const [thumbnails, setThumbnails] = useState({});

  // ── Subtitles ──
  const [subtitles, setSubtitles] = useState([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState(null);

  const [isTranslating, setIsTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState(null);

  // ── Export ──
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ phase: '', percent: 0 });
  const [exportUrl, setExportUrl] = useState(null);
  const [exportSize, setExportSize] = useState(0);

  // ── Player ──
  const [currentTime, setCurrentTime] = useState(0);

  // ── History ──
  const [historyList, setHistoryList] = useState([]);

  const videoRef = useRef(null);

  // ── Computed ──
  const keptScenes = useMemo(
    () => scenes.filter(s => !deletedSceneIds.has(s.id)),
    [scenes, deletedSceneIds]
  );

  const keptDuration = useMemo(
    () => keptScenes.reduce((sum, s) => sum + s.duration, 0),
    [keptScenes]
  );

  const currentScene = useMemo(() => {
    return scenes.find(s => currentTime >= s.start && currentTime < s.end) || null;
  }, [scenes, currentTime]);

  // ── Actions ──
  const setVideoFile = useCallback((file) => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    if (exportUrl) {
      URL.revokeObjectURL(exportUrl);
    }

    const url = URL.createObjectURL(file);
    setVideoFileState(file);
    setVideoUrl(url);
    setVideoName(file.name);
    setScenes([]);
    setDeletedSceneIds(new Set());
    setThumbnails({});
    setExportUrl(null);
    setExportSize(0);
    setCurrentTime(0);
    setDetectProgress(0);
    setSubtitles([]);
  }, [videoUrl, exportUrl]);

  const startDetection = useCallback(async () => {
    if (!videoFile) return;

    setIsDetecting(true);
    setDetectProgress(0);
    setScenes([]);
    setDeletedSceneIds(new Set());
    setThumbnails({});

    try {
      const detectedScenes = await detectScenes(videoFile, {
        sensitivity,
        onProgress: setDetectProgress,
      });
      setScenes(detectedScenes);
      setIsDetecting(false); // Unblock UI immediately after detection

      // Generate thumbnails in background progressively
      if (videoUrl) {
        (async () => {
          for (const scene of detectedScenes) {
            const midTime = scene.start + scene.duration / 2;
            try {
              const thumbUrl = await generateThumbnail(videoUrl, midTime);
              setThumbnails(prev => ({ ...prev, [scene.id]: thumbUrl }));
            } catch (e) {
              console.warn(`Failed to generate thumbnail for scene ${scene.id}`);
            }
          }
        })();
      }
    } catch (error) {
      console.error('Scene detection failed:', error);
      alert('Scene detection failed: ' + error.message);
      setIsDetecting(false);
    }
  }, [videoFile, videoUrl, sensitivity]);

  const toggleDeleteScene = useCallback((sceneId) => {
    setDeletedSceneIds(prev => {
      const next = new Set(prev);
      if (next.has(sceneId)) {
        next.delete(sceneId);
      } else {
        next.add(sceneId);
      }
      return next;
    });
    setExportUrl(null);
  }, []);

  const restoreAllScenes = useCallback(() => {
    setDeletedSceneIds(new Set());
    setExportUrl(null);
  }, []);

  const deleteAllScenes = useCallback(() => {
    setDeletedSceneIds(new Set(scenes.map(s => s.id)));
    setExportUrl(null);
  }, [scenes]);

  const startExport = useCallback(async () => {
    if (!videoFile || keptScenes.length === 0) return;

    setIsExporting(true);
    setExportUrl(null);
    setExportSize(0);

    try {
      const result = await exportVideo(videoFile, keptScenes, setExportProgress);
      setExportUrl(result.url);
      setExportSize(result.size);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed: ' + error.message);
    } finally {
      setIsExporting(false);
    }
  }, [videoFile, keptScenes]);

  const seekToScene = useCallback((scene) => {
    if (videoRef.current) {
      videoRef.current.currentTime = scene.start;
    }
    setCurrentTime(scene.start);
  }, []);

  // ── Transcription ──
  const startTranscription = useCallback(async () => {
    if (!videoFile) return;
    setIsTranscribing(true);
    setTranscribeProgress({ phase: 'Đang tải bộ công cụ...', percent: 0 });

    try {
      const ffmpeg = await getFFmpeg((p) => setTranscribeProgress({ phase: 'Đang tải bộ công cụ...', percent: p }));
      const subs = await transcribeVideo(
        ffmpeg,
        videoFile,
        videoDuration,
        setTranscribeProgress
      );
      setSubtitles(subs);
    } catch (error) {
      console.error(error);
      alert('Lỗi tạo phụ đề: ' + error.message);
    } finally {
      setIsTranscribing(false);
      setTranscribeProgress(null);
    }
  }, [videoFile, videoDuration]);

  // ── Translation ──
  const startTranslation = useCallback(async (targetLanguage) => {
    if (!subtitles || subtitles.length === 0) return;
    setIsTranslating(true);
    setTranslateProgress({ phase: 'Khởi tạo dịch...', percent: 0 });

    try {
      const newSubs = await translateSubtitles(subtitles, targetLanguage, setTranslateProgress);
      setSubtitles(newSubs);
    } catch (error) {
      console.error(error);
      alert('Lỗi dịch phụ đề: ' + error.message);
    } finally {
      setIsTranslating(false);
      setTranslateProgress(null);
    }
  }, [subtitles]);

  const updateSubtitle = useCallback((id, newText) => {
    setSubtitles(prev => prev.map(sub => 
      sub.id === id ? { ...sub, text: newText } : sub
    ));
  }, []);

  // ── History ──
  const saveSession = useCallback(async (name) => {
    try {
      const res = await fetch('/api/history/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || videoName || 'Untitled',
          videoName,
          videoSize: videoFile?.size || 0,
          scenes,
          deletedIds: Array.from(deletedSceneIds),
          threshold: sensitivity,
          subtitles,
        }),
      });
      const data = await res.json();
      return data;
    } catch (error) {
      console.error('Save failed:', error);
      return null;
    }
  }, [videoName, videoFile, scenes, deletedSceneIds, sensitivity]);

  const loadHistoryList = useCallback(async () => {
    try {
      const res = await fetch('/api/history/list');
      const data = await res.json();
      setHistoryList(data);
      return data;
    } catch (error) {
      console.error('Load history list failed:', error);
      return [];
    }
  }, []);

  const loadSession = useCallback(async (id) => {
    try {
      const res = await fetch(`/api/history/${id}`);
      const data = await res.json();
      if (data.scenes) {
        setScenes(data.scenes);
      }
      if (data.deleted_ids) {
        setDeletedSceneIds(new Set(data.deleted_ids));
      }
      if (data.threshold) {
        setSensitivity(data.threshold);
      }
      if (data.subtitles) {
        setSubtitles(data.subtitles);
      }
      return data;
    } catch (error) {
      console.error('Load session failed:', error);
      return null;
    }
  }, []);

  const deleteSession = useCallback(async (id) => {
    try {
      await fetch(`/api/history/${id}`, { method: 'DELETE' });
      await loadHistoryList();
    } catch (error) {
      console.error('Delete session failed:', error);
    }
  }, [loadHistoryList]);

  return {
    // Video
    videoFile, videoUrl, videoDuration, videoName, videoRef,
    setVideoFile, setVideoDuration,
    // Scene detection
    scenes, isDetecting, detectProgress, sensitivity,
    startDetection, setSensitivity,
    // Scene management
    deletedSceneIds, keptScenes, keptDuration, currentScene,
    toggleDeleteScene, restoreAllScenes, deleteAllScenes,
    // Thumbnails
    thumbnails,
    // Export
    isExporting, exportProgress, exportUrl, exportSize,
    isFFmpegLoaded: isFFmpegReady,
    startExport,
    // Player
    currentTime, setCurrentTime, seekToScene,
    // Subtitles
    subtitles, isTranscribing, transcribeProgress, startTranscription,
    isTranslating, translateProgress, startTranslation, updateSubtitle,
    // History
    historyList, saveSession, loadHistoryList, loadSession, deleteSession,
  };
}
