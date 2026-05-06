import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { detectScenes, generateThumbnail } from '../utils/sceneDetection';
import { exportVideo, isFFmpegReady, getFFmpeg } from '../utils/ffmpegManager';
import { transcribeVideo, resumeTranscription } from '../utils/audioExtractor';
import { translateSubtitles, resumeTranslation } from '../utils/subtitleUtils';
import { useUndoHistory } from './useUndoHistory';

export function useVideoEditor() {
  // ── Video State ──
  const [videoFile, setVideoFileState] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoName, setVideoName] = useState('');
  const [videoFilename, setVideoFilename] = useState(''); // server filename

  // ── Session ──
  const [sessionId, setSessionId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [autoSaveStatus, setAutoSaveStatus] = useState(''); // '', 'saving', 'saved'
  const [isRestoring, setIsRestoring] = useState(false);

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

  // ── Export ──
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ phase: '', percent: 0 });
  const [exportUrl, setExportUrl] = useState(null);
  const [exportSize, setExportSize] = useState(0);

  // ── Player ──
  const [currentTime, setCurrentTime] = useState(0);

  // ── History List (for session browser) ──
  const [historyList, setHistoryList] = useState([]);

  const videoRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const sessionIdRef = useRef('');
  const detectAbortControllerRef = useRef(null);

  // ── Undo/Redo ──
  const { pushState, undo: undoAction, redo: redoAction, canUndo, canRedo, resetHistory } = useUndoHistory(30);

  // Keep sessionIdRef in sync
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

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

  const filteredSubtitles = useMemo(() => {
    if (!subtitles || subtitles.length === 0) return [];
    
    // Create a fast lookup for whether a time is in a deleted scene
    const isDeletedAtTime = (time) => {
      const scene = scenes.find(s => time >= s.start && time <= s.end);
      return scene ? deletedSceneIds.has(scene.id) : false;
    };

    return subtitles.filter(sub => {
      // If both start and end are inside a deleted scene, filter it out
      const startDeleted = isDeletedAtTime(sub.start);
      const endDeleted = isDeletedAtTime(sub.end);
      // We can also check if the entire subtitle is enclosed in deleted scenes
      return !(startDeleted && endDeleted);
    });
  }, [subtitles, scenes, deletedSceneIds]);

  // ── Helper: get current snapshot for undo ──
  const getCurrentSnapshot = useCallback(() => ({
    scenes,
    deletedIds: Array.from(deletedSceneIds),
    subtitles,
  }), [scenes, deletedSceneIds, subtitles]);

  // ── Auto-Save Logic ──
  const performAutoSave = useCallback(async (scenesData, deletedIdsData, subtitlesData, transJobId, translJobId) => {
    const sid = sessionIdRef.current;
    if (!sid || !videoFilename) return;

    setAutoSaveStatus('saving');
    try {
      await fetch('/api/session/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sid,
          videoFilename,
          videoOriginalName: videoName,
          scenes: scenesData,
          deletedIds: deletedIdsData,
          subtitles: subtitlesData,
          sensitivity,
          transcriptionJobId: transJobId,
          translationJobId: translJobId,
        }),
      });
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus(''), 2000);
    } catch (error) {
      console.error('Auto-save failed:', error);
      setAutoSaveStatus('');
    }
  }, [videoFilename, videoName, sensitivity]);

  // Trigger auto-save whenever undoable state changes (debounce 2s)
  useEffect(() => {
    // Don't save during initial restore or if no session
    if (isRestoring || !sessionId || !videoFilename) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave(scenes, Array.from(deletedSceneIds), subtitles, transcriptionJobId, translationJobId);
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [scenes, deletedSceneIds, subtitles, sessionId, videoFilename, isRestoring, performAutoSave, transcriptionJobId, translationJobId]);

  // ── Upload Video to Server ──
  const uploadVideo = useCallback(async (file) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Use XMLHttpRequest for progress tracking
      const result = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/video/upload');

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percent);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Upload network error')));
        xhr.send(formData);
      });

      setVideoFilename(result.filename);
      return result;
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload video thất bại: ' + error.message);
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  // ── Set Video File (user picks new file) ──
  const setVideoFile = useCallback(async (file) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (exportUrl) URL.revokeObjectURL(exportUrl);

    const url = URL.createObjectURL(file);
    const newSessionId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setVideoFileState(file);
    setVideoUrl(url);
    setVideoName(file.name);
    setSessionId(newSessionId);
    setScenes([]);
    setDeletedSceneIds(new Set());
    setThumbnails({});
    setExportUrl(null);
    setExportSize(0);
    setCurrentTime(0);
    setDetectProgress(0);
    setSubtitles([]);
    resetHistory();

    // Upload to server in background
    uploadVideo(file);
  }, [videoUrl, exportUrl, uploadVideo, resetHistory]);

  // ── Close project (go back to dashboard) ──
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
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    setVideoFileState(null);
    setVideoUrl(null);
    setVideoName('');
    setVideoFilename('');
    setSessionId('');
    setScenes([]);
    setDeletedSceneIds(new Set());
    setThumbnails({});
    setSubtitles([]);
    setExportUrl(null);
    setExportSize(0);
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
  }, [videoUrl, exportUrl, resetHistory, isDetecting]);

  // ── Scene Detection ──
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
            } catch (e) {
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

  // ── Scene Management (with undo) ──
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
    setExportUrl(null);
  }, [pushState, getCurrentSnapshot]);

  const restoreAllScenes = useCallback(() => {
    pushState(getCurrentSnapshot());
    setDeletedSceneIds(new Set());
    setExportUrl(null);
  }, [pushState, getCurrentSnapshot]);

  const deleteAllScenes = useCallback(() => {
    pushState(getCurrentSnapshot());
    setDeletedSceneIds(new Set(scenes.map(s => s.id)));
    setExportUrl(null);
  }, [scenes, pushState, getCurrentSnapshot]);

  // ── Export ──
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

  // ── Transcription (with undo) ──
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

  // ── Translation (with undo) ──
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

  // ── Update subtitle (with undo) ──
  const updateSubtitle = useCallback((id, newText) => {
    pushState(getCurrentSnapshot());
    setSubtitles(prev => prev.map(sub =>
      sub.id === id ? { ...sub, text: newText } : sub
    ));
  }, [pushState, getCurrentSnapshot]);

  // ── Undo / Redo ──
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

  // ── Session List (for history browser) ──
  const loadHistoryList = useCallback(async () => {
    try {
      const res = await fetch('/api/session/list');
      const data = await res.json();
      setHistoryList(data);
      return data;
    } catch (error) {
      console.error('Load session list failed:', error);
      return [];
    }
  }, []);

  const loadSession = useCallback(async (id) => {
    setIsRestoring(true);
    try {
      const res = await fetch(`/api/session/${id}`);
      const data = await res.json();

      if (data.video_filename) {
        // Fetch video
        const videoRes = await fetch(`/api/video/${data.video_filename}`);
        if (videoRes.ok) {
          const videoBlob = await videoRes.blob();
          if (videoUrl) URL.revokeObjectURL(videoUrl);
          const url = URL.createObjectURL(videoBlob);
          const file = new File([videoBlob], data.video_original_name || 'video.mp4', {
            type: videoBlob.type || 'video/mp4'
          });
          setVideoFileState(file);
          setVideoUrl(url);
          setVideoName(data.video_original_name || 'video.mp4');
          setVideoFilename(data.video_filename);
        }
      }

      setSessionId(data.id);
      if (data.scenes) setScenes(data.scenes);
      if (data.deleted_ids) setDeletedSceneIds(new Set(data.deleted_ids));
      if (data.subtitles) setSubtitles(data.subtitles);
      if (data.sensitivity) setSensitivity(data.sensitivity);
      
      if (data.transcription_job_id) {
        setTranscriptionJobId(data.transcription_job_id);
        setIsTranscribing(true);
        resumeTranscription(data.transcription_job_id, setTranscribeProgress)
          .then(subs => {
            if (sessionIdRef.current !== data.id) return;
            setSubtitles(subs);
            setTranscriptionJobId(null);
            setIsTranscribing(false);
            setTranscribeProgress(null);
            performAutoSave(data.scenes || [], Array.from(new Set(data.deleted_ids || [])), subs, null, data.translation_job_id);
          })
          .catch(err => {
            if (sessionIdRef.current !== data.id) return;
            console.error('Lỗi resume tạo phụ đề:', err);
            setTranscriptionJobId(null);
            setIsTranscribing(false);
            setTranscribeProgress(null);
            performAutoSave(data.scenes || [], Array.from(new Set(data.deleted_ids || [])), data.subtitles || [], null, data.translation_job_id);
          });
      }

      if (data.translation_job_id) {
        const [reqId, outName] = data.translation_job_id.split('|');
        if (reqId && outName) {
          setTranslationJobId(data.translation_job_id);
          setIsTranslating(true);
          resumeTranslation(reqId, outName, setTranslateProgress)
            .then(subs => {
              if (sessionIdRef.current !== data.id) return;
              setSubtitles(subs);
              setTranslationJobId(null);
              setIsTranslating(false);
              setTranslateProgress(null);
              performAutoSave(data.scenes || [], Array.from(new Set(data.deleted_ids || [])), subs, data.transcription_job_id, null);
            })
            .catch(err => {
              if (sessionIdRef.current !== data.id) return;
              console.error('Lỗi resume dịch phụ đề:', err);
              setTranslationJobId(null);
              setIsTranslating(false);
              setTranslateProgress(null);
              performAutoSave(data.scenes || [], Array.from(new Set(data.deleted_ids || [])), data.subtitles || [], data.transcription_job_id, null);
            });
        }
      }

      resetHistory();
      return data;
    } catch (error) {
      console.error('Load session failed:', error);
      return null;
    } finally {
      setIsRestoring(false);
    }
  }, [videoUrl, resetHistory]);

  const deleteSession = useCallback(async (id) => {
    try {
      await fetch(`/api/session/${id}`, { method: 'DELETE' });
      await loadHistoryList();
    } catch (error) {
      console.error('Delete session failed:', error);
    }
  }, [loadHistoryList]);

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
    isFFmpegLoaded: isFFmpegReady,
    startExport,
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
