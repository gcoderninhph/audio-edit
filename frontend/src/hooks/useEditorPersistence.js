import { useState, useCallback, useEffect, useRef } from 'react';
import { resumeTranscription } from '../utils/audioExtractor';
import { resumeTranslation } from '../utils/subtitleUtils';
import { DEFAULT_FRAME_BACKGROUND, DEFAULT_FRAME_PRESET_ID } from '../utils/frameComposer';
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
    if (!data.transcription_job_id) return;

    setTranscriptionJobId(data.transcription_job_id);
    setIsTranscribing(true);

    resumeTranscription(data.transcription_job_id, setTranscribeProgress)
      .then((nextSubtitles) => {
        if (sessionIdRef.current !== data.id) return;

        setSubtitles(nextSubtitles);
        setTranscriptionJobId(null);
        setIsTranscribing(false);
        setTranscribeProgress(null);
        performAutoSave(
          data.scenes || [],
          Array.from(new Set(data.deleted_ids || [])),
          nextSubtitles,
          null,
          data.translation_job_id
        );
      })
      .catch((error) => {
        if (sessionIdRef.current !== data.id) return;

        console.error('Lỗi resume tạo phụ đề:', error);
        setTranscriptionJobId(null);
        setIsTranscribing(false);
        setTranscribeProgress(null);
        performAutoSave(
          data.scenes || [],
          Array.from(new Set(data.deleted_ids || [])),
          data.subtitles || [],
          null,
          data.translation_job_id
        );
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
    if (!data.translation_job_id) return;

    const [requestId, outputFileName] = data.translation_job_id.split('|');
    if (!requestId || !outputFileName) return;

    setTranslationJobId(data.translation_job_id);
    setIsTranslating(true);

    resumeTranslation(requestId, outputFileName, setTranslateProgress)
      .then((nextSubtitles) => {
        if (sessionIdRef.current !== data.id) return;

        setSubtitles(nextSubtitles);
        setTranslationJobId(null);
        setIsTranslating(false);
        setTranslateProgress(null);
        performAutoSave(
          data.scenes || [],
          Array.from(new Set(data.deleted_ids || [])),
          nextSubtitles,
          data.transcription_job_id,
          null
        );
      })
      .catch((error) => {
        if (sessionIdRef.current !== data.id) return;

        console.error('Lỗi resume dịch phụ đề:', error);
        setTranslationJobId(null);
        setIsTranslating(false);
        setTranslateProgress(null);
        performAutoSave(
          data.scenes || [],
          Array.from(new Set(data.deleted_ids || [])),
          data.subtitles || [],
          data.transcription_job_id,
          null
        );
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

      setSessionId(data.id);
      setFramePresetId(data.frame_preset_id || DEFAULT_FRAME_PRESET_ID);
      setFrameBackground(data.frame_background || DEFAULT_FRAME_BACKGROUND);
      setScenes(data.scenes || []);
      setDeletedSceneIds(new Set(data.deleted_ids || []));
      setSubtitles(data.subtitles || []);

      if (data.sensitivity !== undefined && data.sensitivity !== null) {
        setSensitivity(data.sensitivity);
      }

      resumeSavedTranscription(data);
      resumeSavedTranslation(data);

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
    setIsRestoring,
    setScenes,
    setSensitivity,
    setSessionId,
    setSubtitles,
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