import { useState, useCallback, useEffect, useRef } from 'react';
import { DEFAULT_FRAME_BACKGROUND, DEFAULT_FRAME_PRESET_ID, sanitizeFrameBackground } from '../utils/frameComposer';
import { DEFAULT_EXPORT_QUALITY_PROFILE_ID, normalizeExportQualityProfileId } from '../utils/exportQualityProfile';
import { DEFAULT_SUBTITLE_SETTINGS, normalizeSubtitleSettings } from '../utils/subtitleRenderModel';
import { DEFAULT_SUBTITLE_LANGUAGE_KEY, getOriginalSubtitles } from '../utils/subtitleTracks';
import { useEditorPersistenceRestore } from './useEditorPersistenceRestore';
import {
  deleteLocalProject,
  getLocalProject,
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
  subtitleSettings,
  exportQualityProfileId,
  exportAudioMix,
  sceneBulkMotionRules,
  sensitivity,
  scenes,
  deletedSceneIds,
  subtitleTracks,
  activeSubtitleLanguage,
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
  setSubtitleSettings,
  setExportQualityProfileId,
  restoreExportAudioMix,
  setSceneBulkMotionRules,
  setScenes,
  setDeletedSceneIds,
  setActiveSubtitleLanguage,
  setSensitivity,
  setIsTranscribing,
  setTranscribeProgress,
  setTranscriptionJobId,
  setIsTranslating,
  setTranslateProgress,
  setTranslationJobId,
  setIsGeneratingVoiceover,
  setVoiceoverProgress,
  setLastVoiceoverAudioName,
  setVoiceoverTrack,
  setSubtitleTracks,
  restoreSubtitleState,
  resetSubtitleState,
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

  const performAutoSave = useCallback(async ({
    scenesData,
    deletedIdsData,
    subtitleTracksData,
    activeSubtitleLanguageData,
    transJobId,
    translJobId,
  } = {}) => {
    const sid = sessionIdRef.current;
    if (!sid || !videoFilename) return;

    const nextSubtitleTracks = subtitleTracksData || subtitleTracks
    const nextActiveSubtitleLanguage = activeSubtitleLanguageData || activeSubtitleLanguage

    setAutoSaveStatus('saving');
    try {
      await saveLocalProject({
        sessionId: sid,
        videoFilename,
        videoOriginalName: videoName,
        framePresetId,
        frameBackground,
        subtitleSettings,
        exportQualityProfileId,
        exportAudioMix,
        sceneBulkMotionRules,
        scenes: scenesData,
        deletedIds: deletedIdsData,
        activeSubtitleLanguage: nextActiveSubtitleLanguage,
        subtitleTracks: nextSubtitleTracks,
        subtitles: getOriginalSubtitles(nextSubtitleTracks),
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
  }, [activeSubtitleLanguage, exportAudioMix, exportQualityProfileId, frameBackground, framePresetId, sceneBulkMotionRules, sessionIdRef, sensitivity, subtitleSettings, subtitleTracks, videoFilename, videoName]);

  const {
    restoreVideoState,
    restoreVoiceoverState,
    resumeSavedTranscription,
    resumeSavedTranslation,
  } = useEditorPersistenceRestore({
    performAutoSave,
    sessionIdRef,
    setActiveSubtitleLanguage,
    setIsTranscribing,
    setIsTranslating,
    setLastVoiceoverAudioName,
    setSubtitleTracks,
    setTranscribeProgress,
    setTranscriptionJobId,
    setTranslateProgress,
    setTranslationJobId,
    setVideoFileState,
    setVideoFilename,
    setVideoName,
    setVideoUrl,
    setVoiceoverTrack,
    videoUrl,
  })

  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (isRestoring || !sessionId || !videoFilename) {
      return;
    }

    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave({
        activeSubtitleLanguageData: activeSubtitleLanguage,
        deletedIdsData: Array.from(deletedSceneIds),
        scenesData: scenes,
        subtitleTracksData: subtitleTracks,
        transJobId: transcriptionJobId,
        translJobId: translationJobId,
      });
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [
    deletedSceneIds,
    activeSubtitleLanguage,
    isRestoring,
    performAutoSave,
    scenes,
    sessionId,
    subtitleTracks,
    transcriptionJobId,
    translationJobId,
    subtitleSettings,
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
      alert('Video upload failed: ' + error.message);
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

  const loadSession = useCallback(async (id) => {
    setIsRestoring(true);
    try {
      const data = await getLocalProject(id);

      setIsTranscribing(false);
      setTranscribeProgress(null);
      setTranscriptionJobId(null);
      setIsTranslating(false);
      setTranslateProgress(null);
      setTranslationJobId(null);
      setIsGeneratingVoiceover(false);
      setVoiceoverProgress(null);
      setLastVoiceoverAudioName('');
      setVoiceoverTrack(null);

      await restoreVideoState(id, data);

      sessionIdRef.current = data.id;
      setSessionId(data.id);
      setFramePresetId(data.frame_preset_id || DEFAULT_FRAME_PRESET_ID);
      setFrameBackground(sanitizeFrameBackground(data.frame_background || DEFAULT_FRAME_BACKGROUND));
      setSubtitleSettings(normalizeSubtitleSettings(data.subtitle_settings || DEFAULT_SUBTITLE_SETTINGS));
      setExportQualityProfileId(normalizeExportQualityProfileId(data.export_quality_profile_id || DEFAULT_EXPORT_QUALITY_PROFILE_ID));
      restoreExportAudioMix?.(data.export_audio_mix || null);
      setSceneBulkMotionRules?.(data.scene_bulk_motion_rules || []);
      setScenes(data.scenes || []);
      setDeletedSceneIds(new Set(data.deleted_ids || []));
      restoreSubtitleState(data.subtitle_tracks || data.subtitles || [], data.active_subtitle_language || DEFAULT_SUBTITLE_LANGUAGE_KEY);
      await restoreVoiceoverState(id, data);

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
    restoreVoiceoverState,
    resumeSavedTranscription,
    resumeSavedTranslation,
    restoreExportAudioMix,
    setDeletedSceneIds,
    setFrameBackground,
    setFramePresetId,
    setExportQualityProfileId,
    setSceneBulkMotionRules,
    setIsGeneratingVoiceover,
    setIsTranscribing,
    setIsTranslating,
    setIsRestoring,
    setLastVoiceoverAudioName,
    setScenes,
    setSensitivity,
    setSessionId,
    setSubtitleSettings,
    sessionIdRef,
    setTranscribeProgress,
    setTranscriptionJobId,
    setTranslateProgress,
    setTranslationJobId,
    setVoiceoverProgress,
    setVoiceoverTrack,
    restoreSubtitleState,
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
        setSubtitleSettings(DEFAULT_SUBTITLE_SETTINGS);
        setExportQualityProfileId(DEFAULT_EXPORT_QUALITY_PROFILE_ID);
        restoreExportAudioMix?.(null);
        setSceneBulkMotionRules?.([]);
        setScenes([]);
        setDeletedSceneIds(new Set());
        resetSubtitleState();
        setSensitivity(2.5);
        setIsTranscribing(false);
        setTranscribeProgress(null);
        setTranscriptionJobId(null);
        setIsTranslating(false);
        setTranslateProgress(null);
        setTranslationJobId(null);
        setIsGeneratingVoiceover(false);
        setVoiceoverProgress(null);
        setLastVoiceoverAudioName('');
        setVoiceoverTrack(null);
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
    restoreExportAudioMix,
    sessionId,
    setDeletedSceneIds,
    setFrameBackground,
    setFramePresetId,
    setExportQualityProfileId,
    setSceneBulkMotionRules,
    setIsGeneratingVoiceover,
    setIsTranscribing,
    setIsTranslating,
    setLastVoiceoverAudioName,
    setScenes,
    setSensitivity,
    setSessionId,
    setSubtitleSettings,
    setTranscribeProgress,
    setTranscriptionJobId,
    setTranslateProgress,
    setTranslationJobId,
    setVoiceoverProgress,
    setVoiceoverTrack,
    setVideoFileState,
    setVideoFilename,
    setVideoName,
    setVideoUrl,
    videoUrl,
    waitForMediaRelease,
    resetSubtitleState,
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