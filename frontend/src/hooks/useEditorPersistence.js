import { useState, useCallback, useEffect, useRef } from 'react';
import { DEFAULT_FRAME_BACKGROUND, DEFAULT_FRAME_PRESET_ID, sanitizeFrameBackground } from '../utils/frameComposer';
import {
  restoreSavedTranscriptionJob,
  restoreSavedTranslationJob,
} from './editorPersistenceJobRestore';
import {
  deleteLocalProject,
  getLocalProject,
  getLocalProjectVideoReference,
  listLocalProjects,
  releaseVideoUrl,
  saveLocalProject,
  saveLocalProjectVideo,
} from '../utils/projectStorage';

export function useEditorPersistence({
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
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const autoSaveTimerRef = useRef(null);

  const waitForMediaRelease = useCallback(() => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        setTimeout(resolve, 50);
        return;
      }

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(resolve);
      });
    });
  }, []);

  const performAutoSave = useCallback(async (scenesData, deletedIdsData, subtitlesData, transJobId, translJobId) => {
    const sid = sessionIdRef.current;
    if (!sid || !videoFilename) return;

    setAutoSaveStatus('saving');
    try {
      await saveLocalProject({
        sessionId: sid,
        videoFilename,
        videoOriginalName: videoName,
        framePresetId,
        frameBackground,
        scenes: scenesData,
        deletedIds: deletedIdsData,
        subtitles: subtitlesData,
        sensitivity,
        transcriptionJobId: transJobId,
        translationJobId: translJobId,
      });
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus(''), 2000);
    } catch (error) {
      console.error('Auto-save failed:', error);
      setAutoSaveStatus('');
    }
  }, [frameBackground, framePresetId, sessionIdRef, sensitivity, videoFilename, videoName]);

  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (isRestoring || !sessionId || !videoFilename) {
      return;
    }

    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave(scenes, Array.from(deletedSceneIds), subtitles, transcriptionJobId, translationJobId);
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [
    deletedSceneIds,
    isRestoring,
    performAutoSave,
    scenes,
    sessionId,
    subtitles,
    transcriptionJobId,
    translationJobId,
    videoFilename,
  ]);

  const uploadVideo = useCallback(async (projectId, file) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      setUploadProgress(20);
      const result = await saveLocalProjectVideo(projectId, file);
      setUploadProgress(100);

      setVideoFilename(result.filename);
      return result;
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload video thất bại: ' + error.message);
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [setVideoFilename]);

  const loadHistoryList = useCallback(async () => {
    try {
      const data = await listLocalProjects();
      setHistoryList(data);
      return data;
    } catch (error) {
      console.error('Load session list failed:', error);
      return [];
    }
  }, []);

  const restoreVideoState = useCallback(async (projectId, data) => {
    if (!data.video_filename) return;

    const restoredVideo = await getLocalProjectVideoReference(projectId);
    if (!restoredVideo) return;

    releaseVideoUrl(videoUrl);
    setVideoFileState(restoredVideo.source);
    setVideoUrl(restoredVideo.url);
    setVideoName(data.video_original_name || restoredVideo.name || 'video.mp4');
    setVideoFilename(data.video_filename || restoredVideo.storedFileName);
  }, [setVideoFileState, setVideoFilename, setVideoName, setVideoUrl, videoUrl]);

  const resumeSavedTranscription = useCallback((data) => {
    return restoreSavedTranscriptionJob(data, {
      performAutoSave,
      sessionIdRef,
      setIsTranscribing,
      setSubtitles,
      setTranscribeProgress,
      setTranscriptionJobId,
    });
  }, [
    performAutoSave,
    sessionIdRef,
    setIsTranscribing,
    setSubtitles,
    setTranscribeProgress,
    setTranscriptionJobId,
  ]);

  const resumeSavedTranslation = useCallback((data) => {
    return restoreSavedTranslationJob(data, {
      performAutoSave,
      sessionIdRef,
      setIsTranslating,
      setSubtitles,
      setTranslateProgress,
      setTranslationJobId,
    });
  }, [
    performAutoSave,
    sessionIdRef,
    setIsTranslating,
    setSubtitles,
    setTranslateProgress,
    setTranslationJobId,
  ]);

  const loadSession = useCallback(async (id) => {
    setIsRestoring(true);
    try {
      const data = await getLocalProject(id);

      await restoreVideoState(id, data);

      setIsTranscribing(false);
      setTranscribeProgress(null);
      setTranscriptionJobId(null);
      setIsTranslating(false);
      setTranslateProgress(null);
      setTranslationJobId(null);

      sessionIdRef.current = data.id;
      setSessionId(data.id);
      setFramePresetId(data.frame_preset_id || DEFAULT_FRAME_PRESET_ID);
      setFrameBackground(sanitizeFrameBackground(data.frame_background || DEFAULT_FRAME_BACKGROUND));
      setScenes(data.scenes || []);
      setDeletedSceneIds(new Set(data.deleted_ids || []));
      setSubtitles(data.subtitles || []);

      if (data.sensitivity !== undefined && data.sensitivity !== null) {
        setSensitivity(data.sensitivity);
      }

      if (data.transcription_job_id) {
        void resumeSavedTranscription(data);
      }

      if (data.translation_job_id) {
        void resumeSavedTranslation(data);
      }

      resetHistory();
      return data;
    } catch (error) {
      console.error('Load session failed:', error);
      return null;
    } finally {
      setIsRestoring(false);
    }
  }, [
    resetHistory,
    restoreVideoState,
    resumeSavedTranscription,
    resumeSavedTranslation,
    setDeletedSceneIds,
    setFrameBackground,
    setFramePresetId,
    setIsTranscribing,
    setIsTranslating,
    setIsRestoring,
    setScenes,
    setSensitivity,
    setSessionId,
    setSubtitles,
    sessionIdRef,
    setTranscribeProgress,
    setTranscriptionJobId,
    setTranslateProgress,
    setTranslationJobId,
  ]);

  const deleteSession = useCallback(async (id) => {
    try {
      if (id === sessionId) {
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }

        releaseVideoUrl(videoUrl);
        setAutoSaveStatus('');
        setVideoFileState(null);
        setVideoUrl('');
        setVideoName('');
        setVideoFilename('');
        setSessionId('');
        setFramePresetId(DEFAULT_FRAME_PRESET_ID);
        setFrameBackground(DEFAULT_FRAME_BACKGROUND);
        setScenes([]);
        setDeletedSceneIds(new Set());
        setSubtitles([]);
        setSensitivity(2.5);
        setIsTranscribing(false);
        setTranscribeProgress(null);
        setTranscriptionJobId(null);
        setIsTranslating(false);
        setTranslateProgress(null);
        setTranslationJobId(null);
        resetHistory();

        await waitForMediaRelease()
      }

      await deleteLocalProject(id);
      await loadHistoryList();
    } catch (error) {
      console.error('Delete session failed:', error);
    }
  }, [
    loadHistoryList,
    resetHistory,
    sessionId,
    setDeletedSceneIds,
    setFrameBackground,
    setFramePresetId,
    setIsTranscribing,
    setIsTranslating,
    setScenes,
    setSensitivity,
    setSessionId,
    setSubtitles,
    setTranscribeProgress,
    setTranscriptionJobId,
    setTranslateProgress,
    setTranslationJobId,
    setVideoFileState,
    setVideoFilename,
    setVideoName,
    setVideoUrl,
    videoUrl,
    waitForMediaRelease,
  ]);

  return {
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
  };
}