import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { detectScenes, generateThumbnail } from '../utils/sceneDetection';
import { DEFAULT_FRAME_BACKGROUND, DEFAULT_FRAME_PRESET_ID } from '../utils/frameComposer';
import { getKeptScenes, getKeptDuration } from '../utils/timeMapping';
import { filterVisibleSubtitles, getCurrentSceneAtTime } from '../utils/editorSelectors';
import { useUndoHistory } from './useUndoHistory';
import { useEditorPersistence } from './useEditorPersistence';
import { useVideoEditorSubtitleActions } from './useVideoEditorSubtitleActions';
import { useFrameExport } from './useFrameExport';
import { useSceneMotionConfig } from './useSceneMotionConfig';
import { useSubtitleTracks } from './useSubtitleTracks';
import { useVideoEditorVoiceoverState } from './useVideoEditorVoiceoverState';
import { DEFAULT_EXPORT_QUALITY_PROFILE_ID } from '../utils/exportQualityProfile';
import { DEFAULT_SUBTITLE_SETTINGS } from '../utils/subtitleRenderModel';

export function useVideoEditor() {
  const [videoFile, setVideoFileState] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoName, setVideoName] = useState('');
  const [videoFilename, setVideoFilename] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [scenes, setScenes] = useState([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectProgress, setDetectProgress] = useState(0);
  const [sensitivity, setSensitivity] = useState(2.5);
  const [deletedSceneIds, setDeletedSceneIds] = useState(new Set());
  const [thumbnails, setThumbnails] = useState({});
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState(null);
  const [transcriptionJobId, setTranscriptionJobId] = useState(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState(null);
  const [translationJobId, setTranslationJobId] = useState(null);
  const [isGeneratingVoiceover, setIsGeneratingVoiceover] = useState(false);
  const [voiceoverProgress, setVoiceoverProgress] = useState(null);
  const [lastVoiceoverAudioName, setLastVoiceoverAudioName] = useState('');
  const [voiceoverTrack, setVoiceoverTrack] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const videoRef = useRef(null);
  const sessionIdRef = useRef('');
  const detectAbortControllerRef = useRef(null);
  const {
    activeSubtitleLanguage,
    originalSubtitles,
    resetSubtitleState,
    restoreSubtitleState,
    setActiveSubtitleLanguage,
    setSubtitleTracks,
    subtitleLanguageOptions,
    subtitleTracks,
    updateActiveSubtitle,
    visibleSubtitles: subtitles,
  } = useSubtitleTracks();
  const { pushState, undo: undoAction, redo: redoAction, canUndo, canRedo, resetHistory } = useUndoHistory(30);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => () => {
    if (voiceoverTrack?.previewUrl) {
      URL.revokeObjectURL(voiceoverTrack.previewUrl);
    }
  }, [voiceoverTrack]);

  const keptScenes = useMemo(() => getKeptScenes(scenes, deletedSceneIds), [scenes, deletedSceneIds]);
  const keptDuration = useMemo(() => getKeptDuration(keptScenes), [keptScenes]);
  const currentScene = useMemo(() => getCurrentSceneAtTime(scenes, currentTime), [scenes, currentTime]);

  const filteredSubtitles = useMemo(() => filterVisibleSubtitles(subtitles, scenes, deletedSceneIds), [subtitles, scenes, deletedSceneIds]);
  const { localizedVoiceoverAudioName, localizedVoiceoverTrack, voiceoverSubtitles } = useVideoEditorVoiceoverState({ activeSubtitleLanguage, filteredSubtitles, keptScenes, lastVoiceoverAudioName, voiceoverTrack });

  const {
    framePresetId,
    setFramePresetId,
    frameBackground,
    setFrameBackground,
    subtitleSettings,
    setSubtitleSettings,
    exportQualityProfileId,
    setExportQualityProfileId,
    exportFileName,
    setExportFileName,
    exportOutputDirectory,
    chooseExportOutputDirectory,
    videoVolume,
    voiceoverVolume,
    handleVideoVolumeChange,
    handleVoiceoverVolumeChange,
    handleToggleVideoMute,
    exportAudioMix,
    restoreExportAudioMix,
    framePreset,
    frameSummary,
    frameBackgroundLabel,
    isExporting,
    exportProgress,
    exportUrl,
    exportSavedFilePath,
    exportSize,
    isFFmpegLoaded,
    revealExportSavedFile,
    startExport,
    clearExportResult,
  } = useFrameExport({
    videoFile,
    keptScenes,
    filteredSubtitles,
    videoDuration,
    voiceoverTrack,
  });

  const getCurrentSnapshot = useCallback(() => ({
    scenes,
    deletedIds: Array.from(deletedSceneIds),
    subtitleTracks,
  }), [deletedSceneIds, scenes, subtitleTracks]);

  const { applySceneMotionBulkConfig, detectSceneFace, sceneBulkMotionRules, setSceneBulkMotionRules, setSceneMotionConfig } = useSceneMotionConfig({
    clearExportResult,
    getCurrentSnapshot,
    pushState,
    scenes,
    setScenes,
    videoUrl,
  });

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
    setSubtitleSettings(DEFAULT_SUBTITLE_SETTINGS);
    setExportQualityProfileId(DEFAULT_EXPORT_QUALITY_PROFILE_ID);
    restoreExportAudioMix(null);
    setSceneBulkMotionRules([]);
    setScenes([]);
    setDeletedSceneIds(new Set());
    setThumbnails({});
    setCurrentTime(0);
    setDetectProgress(0);
    resetSubtitleState();
    setIsGeneratingVoiceover(false);
    setVoiceoverProgress(null);
    setLastVoiceoverAudioName('');
    setVoiceoverTrack(null);
    resetHistory();
    uploadVideo(newSessionId, file);
  }, [clearExportResult, resetHistory, resetSubtitleState, restoreExportAudioMix, setExportQualityProfileId, setFrameBackground, setFramePresetId, setSceneBulkMotionRules, setSubtitleSettings, uploadVideo, videoUrl]);

  const closeProject = useCallback(() => {
    if (isDetecting) {
      if (!window.confirm('Scene detection in progress will be canceled. Are you sure you want to leave?')) {
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
    setSubtitleSettings(DEFAULT_SUBTITLE_SETTINGS);
    setExportQualityProfileId(DEFAULT_EXPORT_QUALITY_PROFILE_ID);
    restoreExportAudioMix(null);
    setSceneBulkMotionRules([]);
    setScenes([]);
    setDeletedSceneIds(new Set());
    setThumbnails({});
    resetSubtitleState();
    setCurrentTime(0);
    setDetectProgress(0);
    setAutoSaveStatus('');
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
    setIsDetecting(false);
    resetHistory();
  }, [clearExportResult, isDetecting, resetHistory, resetSubtitleState, restoreExportAudioMix, setAutoSaveStatus, setExportQualityProfileId, setFrameBackground, setFramePresetId, setSceneBulkMotionRules, setSubtitleSettings, videoUrl]);

  const startDetection = useCallback(async () => {
    if (!videoFile) return;
    const currentSessionId = sessionIdRef.current;
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

  const { startTranscription, startTranslation, startVoiceover, updateSubtitle } = useVideoEditorSubtitleActions({
    activeSubtitleLanguage,
    deletedSceneIds,
    getCurrentSnapshot,
    originalSubtitles,
    performAutoSave,
    pushState,
    scenes,
    sessionIdRef,
    setActiveSubtitleLanguage,
    setIsGeneratingVoiceover,
    setIsTranscribing,
    setIsTranslating,
    setLastVoiceoverAudioName,
    setSubtitleTracks,
    setTranscribeProgress,
    setTranscriptionJobId,
    setTranslateProgress,
    setTranslationJobId,
    setVoiceoverProgress,
    setVoiceoverTrack,
    subtitleTracks,
    transcriptionJobId,
    translationJobId,
    updateActiveSubtitle,
    videoDuration,
    videoFile,
    voiceoverSubtitles,
  })

  const performUndo = useCallback(() => {
    const snapshot = undoAction(getCurrentSnapshot());
    if (!snapshot) return;
    setScenes(snapshot.scenes || []);
    setDeletedSceneIds(new Set(snapshot.deletedIds || []));
    setSubtitleTracks(snapshot.subtitleTracks || snapshot.subtitles || []);
  }, [getCurrentSnapshot, setSubtitleTracks, undoAction]);

  const performRedo = useCallback(() => {
    const snapshot = redoAction(getCurrentSnapshot());
    if (!snapshot) return;
    setScenes(snapshot.scenes || []);
    setDeletedSceneIds(new Set(snapshot.deletedIds || []));
    setSubtitleTracks(snapshot.subtitleTracks || snapshot.subtitles || []);
  }, [getCurrentSnapshot, redoAction, setSubtitleTracks]);

  const exportConfig = useMemo(() => ({ qualityProfileId: exportQualityProfileId, setQualityProfileId: setExportQualityProfileId, fileName: exportFileName, setFileName: setExportFileName, outputDirectory: exportOutputDirectory, chooseOutputDirectory: chooseExportOutputDirectory }), [chooseExportOutputDirectory, exportFileName, exportOutputDirectory, exportQualityProfileId, setExportFileName, setExportQualityProfileId]);

  const exportResult = useMemo(() => ({ savedFilePath: exportSavedFilePath, size: exportSize, url: exportUrl, revealSavedFile: revealExportSavedFile }), [exportSavedFilePath, exportSize, exportUrl, revealExportSavedFile]);

  return {
    videoFile, videoUrl, videoDuration, videoName, videoRef, setVideoFile, setVideoDuration, closeProject,
    isUploading, uploadProgress, sessionId, autoSaveStatus, isRestoring,
    scenes, isDetecting, detectProgress, sensitivity, startDetection, setSensitivity,
    deletedSceneIds, keptScenes, keptDuration, currentScene, toggleDeleteScene, restoreAllScenes, deleteAllScenes,
    thumbnails, isExporting, exportProgress, exportResult, isFFmpegLoaded, startExport,
    framePresetId, setFramePresetId, frameBackground, setFrameBackground, subtitleSettings, setSubtitleSettings, exportConfig,
    videoVolume, voiceoverVolume, handleVideoVolumeChange, handleVoiceoverVolumeChange, handleToggleVideoMute,
    framePreset, frameSummary, frameBackgroundLabel, currentTime, setCurrentTime, seekToScene, setSceneMotionConfig, detectSceneFace, applySceneMotionBulkConfig, sceneBulkMotionRules, setSceneBulkMotionRules,
    activeSubtitleLanguage, setActiveSubtitleLanguage, subtitleLanguageOptions,
    subtitles, filteredSubtitles, isTranscribing, transcribeProgress, startTranscription,
    isTranslating, translateProgress, startTranslation,
    isGeneratingVoiceover, voiceoverProgress, lastVoiceoverAudioName: localizedVoiceoverAudioName, voiceoverTrack: localizedVoiceoverTrack, startVoiceover, updateSubtitle,
    undo: performUndo, redo: performRedo, canUndo, canRedo, historyList, loadHistoryList, loadSession, deleteSession,
  };
}
