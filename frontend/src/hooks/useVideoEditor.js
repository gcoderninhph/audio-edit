import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { detectScenes, generateThumbnail } from '../utils/sceneDetection';
import { getFFmpeg } from '../utils/ffmpegManager';
import { transcribeVideo } from '../utils/audioExtractor';
import { translateSubtitles } from '../utils/subtitleUtils';
import { DEFAULT_FRAME_BACKGROUND, DEFAULT_FRAME_PRESET_ID } from '../utils/frameComposer';
import { getKeptScenes, getKeptDuration } from '../utils/timeMapping';
import { filterVisibleSubtitles, getCurrentSceneAtTime } from '../utils/editorSelectors';
import { useUndoHistory } from './useUndoHistory';
import { useEditorPersistence } from './useEditorPersistence';
import { useFrameExport } from './useFrameExport';

export function useVideoEditor() {
  // ── Video State ──
  const [videoFile, setVideoFileState] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoName, setVideoName] = useState('');
  const [videoFilename, setVideoFilename] = useState(''); // server filename

  // ── Session ──
  const [sessionId, setSessionId] = useState('');

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
  const [transcriptionJobId, setTranscriptionJobId] = useState(null);

  const [isTranslating, setIsTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState(null);
  const [translationJobId, setTranslationJobId] = useState(null);

  // ── Player ──
  const [currentTime, setCurrentTime] = useState(0);

  const videoRef = useRef(null);
  const sessionIdRef = useRef('');
  const detectAbortControllerRef = useRef(null);

  // ── Undo/Redo ──
  const { pushState, undo: undoAction, redo: redoAction, canUndo, canRedo, resetHistory } = useUndoHistory(30);

  // Keep sessionIdRef in sync
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // ── Computed ──
  const keptScenes = useMemo(() => getKeptScenes(scenes, deletedSceneIds), [scenes, deletedSceneIds]);
  const keptDuration = useMemo(() => getKeptDuration(keptScenes), [keptScenes]);

  const currentScene = useMemo(() => getCurrentSceneAtTime(scenes, currentTime), [scenes, currentTime]);

  const filteredSubtitles = useMemo(() => filterVisibleSubtitles(subtitles, scenes, deletedSceneIds), [subtitles, scenes, deletedSceneIds]);

  const {
    framePresetId,
    setFramePresetId,
    frameBackground,
    setFrameBackground,
    framePreset,
    frameSummary,
    frameBackgroundLabel,
    isExporting,
    exportProgress,
    exportUrl,
    exportSize,
    isFFmpegLoaded,
    startExport,
    clearExportResult,
  } = useFrameExport({
    videoFile,
    keptScenes,
    filteredSubtitles,
  });

  const getCurrentSnapshot = useCallback(() => ({
    scenes,
    deletedIds: Array.from(deletedSceneIds),
    subtitles,
  }), [scenes, deletedSceneIds, subtitles]);

  const {
    isUploading,
    uploadProgress,
    autoSaveStatus,
    setAutoSaveStatus,
    isRestoring,
    historyList,
    performAutoSave,
    uploadVideo,
    loadHistoryList,
    loadSession,
    deleteSession,
  } = useEditorPersistence({
    sessionId,
    sessionIdRef,
    videoFilename,
    videoName,
    framePresetId,
    frameBackground,
    sensitivity,
    scenes,
    deletedSceneIds,
    subtitles,
    transcriptionJobId,
    translationJobId,
    videoUrl,
    resetHistory,
    setVideoFilename,
    setVideoFileState,
    setVideoUrl,
    setVideoName,
    setSessionId,
    setFramePresetId,
    setFrameBackground,
    setScenes,
    setDeletedSceneIds,
    setSubtitles,
    setSensitivity,
    setIsTranscribing,
    setTranscribeProgress,
    setTranscriptionJobId,
    setIsTranslating,
    setTranslateProgress,
    setTranslationJobId,
  });

  const setVideoFile = useCallback(async (file) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    clearExportResult();

    const url = URL.createObjectURL(file);
    const newSessionId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setVideoFileState(file);
    setVideoUrl(url);
    setVideoName(file.name);
    setSessionId(newSessionId);
    setFramePresetId(DEFAULT_FRAME_PRESET_ID);
    setFrameBackground(DEFAULT_FRAME_BACKGROUND);
    setScenes([]);
    setDeletedSceneIds(new Set());
    setThumbnails({});
    setCurrentTime(0);
    setDetectProgress(0);
    setSubtitles([]);
    resetHistory();

    // Persist the selected source video into the desktop project store in background.
    uploadVideo(newSessionId, file);
  }, [clearExportResult, resetHistory, setFrameBackground, setFramePresetId, uploadVideo, videoUrl]);

  const closeProject = useCallback(() => {
    if (isDetecting) {
      if (!window.confirm("Quá trình cắt cảnh đang diễn ra sẽ bị hủy. Bạn có chắc chắn muốn thoát?")) {
        return;
      }
      if (detectAbortControllerRef.current) {
        detectAbortControllerRef.current.abort();
      }
    }

    if (videoUrl) URL.revokeObjectURL(videoUrl);
    clearExportResult();
    setVideoFileState(null);
    setVideoUrl(null);
    setVideoName('');
    setVideoFilename('');
    setSessionId('');
    setFramePresetId(DEFAULT_FRAME_PRESET_ID);
    setFrameBackground(DEFAULT_FRAME_BACKGROUND);
    setScenes([]);
    setDeletedSceneIds(new Set());
    setThumbnails({});
    setSubtitles([]);
    setCurrentTime(0);
    setDetectProgress(0);
    setAutoSaveStatus('');
    setIsTranscribing(false);
    setTranscribeProgress(null);
    setTranscriptionJobId(null);
    setIsTranslating(false);
    setTranslateProgress(null);
    setTranslationJobId(null);
    setIsDetecting(false);
    resetHistory();
  }, [clearExportResult, isDetecting, resetHistory, setAutoSaveStatus, setFrameBackground, setFramePresetId, videoUrl]);

  const startDetection = useCallback(async () => {
    if (!videoFile) return;
    const currentSessionId = sessionIdRef.current;

    // Push undo snapshot before detection replaces scenes
    if (scenes.length > 0) {
      pushState(getCurrentSnapshot());
    }

    setIsDetecting(true);
    setDetectProgress(0);
    setScenes([]);
    setDeletedSceneIds(new Set());
    setThumbnails({});

    if (detectAbortControllerRef.current) {
      detectAbortControllerRef.current.abort();
    }
    detectAbortControllerRef.current = new AbortController();

    try {
      const detectedScenes = await detectScenes(videoFile, {
        sensitivity,
        signal: detectAbortControllerRef.current.signal,
        onProgress: (p) => {
          if (sessionIdRef.current === currentSessionId) setDetectProgress(p);
        },
      });
      if (sessionIdRef.current !== currentSessionId) return;
      
      setScenes(detectedScenes);
      setIsDetecting(false);

      // Generate thumbnails in background progressively
      if (videoUrl) {
        (async () => {
          for (const scene of detectedScenes) {
            if (sessionIdRef.current !== currentSessionId) break;
            const midTime = scene.start + scene.duration / 2;
            try {
              const thumbUrl = await generateThumbnail(videoUrl, midTime);
              if (sessionIdRef.current === currentSessionId) {
                setThumbnails(prev => ({ ...prev, [scene.id]: thumbUrl }));
              }
            } catch {
              console.warn(`Failed to generate thumbnail for scene ${scene.id}`);
            }
          }
        })();
      }
    } catch (error) {
      if (error.message === 'Scene detection aborted') {
        setIsDetecting(false);
        setDetectProgress(0);
        return;
      }
      if (sessionIdRef.current !== currentSessionId) return;
      console.error('Scene detection failed:', error);
      alert('Scene detection failed: ' + error.message);
      setIsDetecting(false);
    }
  }, [videoFile, videoUrl, sensitivity, scenes, pushState, getCurrentSnapshot]);

  const toggleDeleteScene = useCallback((sceneId) => {
    pushState(getCurrentSnapshot());
    setDeletedSceneIds(prev => {
      const next = new Set(prev);
      if (next.has(sceneId)) {
        next.delete(sceneId);
      } else {
        next.add(sceneId);
      }
      return next;
    });
    clearExportResult();
  }, [clearExportResult, pushState, getCurrentSnapshot]);

  const restoreAllScenes = useCallback(() => {
    pushState(getCurrentSnapshot());
    setDeletedSceneIds(new Set());
    clearExportResult();
  }, [clearExportResult, pushState, getCurrentSnapshot]);

  const deleteAllScenes = useCallback(() => {
    pushState(getCurrentSnapshot());
    setDeletedSceneIds(new Set(scenes.map(s => s.id)));
    clearExportResult();
  }, [clearExportResult, scenes, pushState, getCurrentSnapshot]);

  const seekToScene = useCallback((scene) => {
    if (videoRef.current) {
      videoRef.current.currentTime = scene.start;
    }
    setCurrentTime(scene.start);
  }, []);

  const startTranscription = useCallback(async () => {
    if (!videoFile) return;
    const currentSessionId = sessionIdRef.current;
    pushState(getCurrentSnapshot());
    setIsTranscribing(true);
    setTranscribeProgress({ phase: 'Đang tải bộ công cụ...', percent: 0 });

    try {
      const ffmpeg = await getFFmpeg((p) => setTranscribeProgress({ phase: 'Đang tải bộ công cụ...', percent: p }));
      const subs = await transcribeVideo(
        ffmpeg,
        videoFile,
        videoDuration,
        setTranscribeProgress,
        (jobId) => {
          if (sessionIdRef.current !== currentSessionId) return;
          setTranscriptionJobId(jobId);
          // Force immediate save to DB so F5 doesn't lose it
          performAutoSave(scenes, Array.from(deletedSceneIds), subtitles, jobId, translationJobId);
        }
      );
      if (sessionIdRef.current !== currentSessionId) return;
      setSubtitles(subs);
      setTranscriptionJobId(null); // Clear on success
      performAutoSave(scenes, Array.from(deletedSceneIds), subs, null, translationJobId);
    } catch (error) {
      if (sessionIdRef.current !== currentSessionId) return;
      console.error(error);
      alert('Lỗi tạo phụ đề: ' + error.message);
      setTranscriptionJobId(null);
    } finally {
      if (sessionIdRef.current === currentSessionId) {
        setIsTranscribing(false);
        setTranscribeProgress(null);
      }
    }
  }, [videoFile, videoDuration, pushState, getCurrentSnapshot, scenes, deletedSceneIds, subtitles, translationJobId, performAutoSave]);

  const startTranslation = useCallback(async (targetLanguage) => {
    if (!subtitles || subtitles.length === 0) return;
    const currentSessionId = sessionIdRef.current;
    pushState(getCurrentSnapshot());
    setIsTranslating(true);
    setTranslateProgress({ phase: 'Khởi tạo dịch...', percent: 0 });

    try {
      const newSubs = await translateSubtitles(
        subtitles, 
        targetLanguage, 
        setTranslateProgress,
        (reqId, outName) => {
          if (sessionIdRef.current !== currentSessionId) return;
          const jobId = `${reqId}|${outName}`;
          setTranslationJobId(jobId);
          // Force immediate save
          performAutoSave(scenes, Array.from(deletedSceneIds), subtitles, transcriptionJobId, jobId);
        }
      );
      if (sessionIdRef.current !== currentSessionId) return;
      setSubtitles(newSubs);
      setTranslationJobId(null); // Clear on success
      performAutoSave(scenes, Array.from(deletedSceneIds), newSubs, transcriptionJobId, null);
    } catch (error) {
      if (sessionIdRef.current !== currentSessionId) return;
      console.error(error);
      alert('Lỗi dịch phụ đề: ' + error.message);
      setTranslationJobId(null);
    } finally {
      if (sessionIdRef.current === currentSessionId) {
        setIsTranslating(false);
        setTranslateProgress(null);
      }
    }
  }, [subtitles, pushState, getCurrentSnapshot, scenes, deletedSceneIds, transcriptionJobId, performAutoSave]);

  const updateSubtitle = useCallback((id, newText) => {
    pushState(getCurrentSnapshot());
    setSubtitles(prev => prev.map(sub =>
      sub.id === id ? { ...sub, text: newText } : sub
    ));
  }, [pushState, getCurrentSnapshot]);

  const performUndo = useCallback(() => {
    const snapshot = undoAction(getCurrentSnapshot());
    if (!snapshot) return;
    setScenes(snapshot.scenes || []);
    setDeletedSceneIds(new Set(snapshot.deletedIds || []));
    setSubtitles(snapshot.subtitles || []);
  }, [undoAction, getCurrentSnapshot]);

  const performRedo = useCallback(() => {
    const snapshot = redoAction(getCurrentSnapshot());
    if (!snapshot) return;
    setScenes(snapshot.scenes || []);
    setDeletedSceneIds(new Set(snapshot.deletedIds || []));
    setSubtitles(snapshot.subtitles || []);
  }, [redoAction, getCurrentSnapshot]);

  return {
    // Video
    videoFile, videoUrl, videoDuration, videoName, videoRef,
    setVideoFile, setVideoDuration, closeProject,
    // Upload
    isUploading, uploadProgress,
    // Session
    sessionId, autoSaveStatus, isRestoring,
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
    isFFmpegLoaded,
    startExport,
    framePresetId, setFramePresetId, frameBackground, setFrameBackground,
    framePreset, frameSummary, frameBackgroundLabel,
    // Player
    currentTime, setCurrentTime, seekToScene,
    // Subtitles
    subtitles, filteredSubtitles, isTranscribing, transcribeProgress, startTranscription,
    isTranslating, translateProgress, startTranslation, updateSubtitle,
    // Undo/Redo
    undo: performUndo, redo: performRedo, canUndo, canRedo,
    // History
    historyList, loadHistoryList, loadSession, deleteSession,
  };
}
