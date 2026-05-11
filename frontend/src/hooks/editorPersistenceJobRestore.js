import { getTranscriptionJobSnapshot, resumeTranscription } from '../utils/audioExtractor';
import {
  downloadTranslatedSubtitles,
  getTranslationJobSnapshot,
  parseTranslationJobId,
  resumeTranslation,
} from '../utils/subtitleUtils';
import {
  DEFAULT_SUBTITLE_LANGUAGE_KEY,
  normalizeActiveSubtitleLanguage,
  normalizeSubtitleTracks,
  setSubtitleTrackSubtitles,
} from '../utils/subtitleTracks';

function getSavedDeletedIds(data) {
  return Array.from(new Set(data.deleted_ids || []));
}

function getSavedSubtitleTracks(data) {
  return normalizeSubtitleTracks(data.subtitle_tracks || data.subtitles || [])
}

export async function restoreSavedTranscriptionJob(data, dependencies) {
  if (!data.transcription_job_id) return;

  const deletedIds = getSavedDeletedIds(data);
  const savedSubtitleTracks = getSavedSubtitleTracks(data)
  const {
    performAutoSave,
    sessionIdRef,
    setIsTranscribing,
    setActiveSubtitleLanguage,
    setSubtitleTracks,
    setTranscribeProgress,
    setTranscriptionJobId,
  } = dependencies;
  const updateTranscribeProgress = (progress) => {
    if (sessionIdRef.current !== data.id) return;
    setTranscribeProgress(progress);
  };

  try {
    const snapshot = await getTranscriptionJobSnapshot(data.transcription_job_id);
    if (sessionIdRef.current !== data.id) return;

    if (snapshot.state === 'missing' || snapshot.state === 'failed') {
      setTranscriptionJobId(null);
      setIsTranscribing(false);
      setTranscribeProgress(null);
      void performAutoSave({
        activeSubtitleLanguageData: data.active_subtitle_language || DEFAULT_SUBTITLE_LANGUAGE_KEY,
        deletedIdsData: deletedIds,
        scenesData: data.scenes || [],
        subtitleTracksData: savedSubtitleTracks,
        transJobId: null,
        translJobId: data.translation_job_id,
      });
      return;
    }

    if (snapshot.state === 'finished') {
      const nextSubtitleTracks = setSubtitleTrackSubtitles(savedSubtitleTracks, DEFAULT_SUBTITLE_LANGUAGE_KEY, snapshot.subtitles)
      setSubtitleTracks(nextSubtitleTracks);
      setActiveSubtitleLanguage(DEFAULT_SUBTITLE_LANGUAGE_KEY);
      setTranscriptionJobId(null);
      setIsTranscribing(false);
      setTranscribeProgress(null);
      void performAutoSave({
        activeSubtitleLanguageData: DEFAULT_SUBTITLE_LANGUAGE_KEY,
        deletedIdsData: deletedIds,
        scenesData: data.scenes || [],
        subtitleTracksData: nextSubtitleTracks,
        transJobId: null,
        translJobId: data.translation_job_id,
      });
      return;
    }

    setTranscriptionJobId(data.transcription_job_id);
    setIsTranscribing(true);
    updateTranscribeProgress({ phase: 'Resuming subtitle generation...', percent: 30 });

    const nextSubtitles = await resumeTranscription(data.transcription_job_id, updateTranscribeProgress, { initialDelayMs: 0 });
    if (sessionIdRef.current !== data.id) return;

    const nextSubtitleTracks = setSubtitleTrackSubtitles(savedSubtitleTracks, DEFAULT_SUBTITLE_LANGUAGE_KEY, nextSubtitles)
    setSubtitleTracks(nextSubtitleTracks);
    setActiveSubtitleLanguage(DEFAULT_SUBTITLE_LANGUAGE_KEY);
    setTranscriptionJobId(null);
    setIsTranscribing(false);
    setTranscribeProgress(null);
    void performAutoSave({
      activeSubtitleLanguageData: DEFAULT_SUBTITLE_LANGUAGE_KEY,
      deletedIdsData: deletedIds,
      scenesData: data.scenes || [],
      subtitleTracksData: nextSubtitleTracks,
      transJobId: null,
      translJobId: data.translation_job_id,
    });
  } catch (error) {
    if (sessionIdRef.current !== data.id) return;

    console.error('Failed to resume subtitle generation:', error);
    setTranscriptionJobId(null);
    setIsTranscribing(false);
    setTranscribeProgress(null);
    void performAutoSave({
      activeSubtitleLanguageData: data.active_subtitle_language || DEFAULT_SUBTITLE_LANGUAGE_KEY,
      deletedIdsData: deletedIds,
      scenesData: data.scenes || [],
      subtitleTracksData: savedSubtitleTracks,
      transJobId: null,
      translJobId: data.translation_job_id,
    });
  }
}

export async function restoreSavedTranslationJob(data, dependencies) {
  if (!data.translation_job_id) return;

  const { languageKey, outputFileName, requestId } = parseTranslationJobId(data.translation_job_id)
  const deletedIds = getSavedDeletedIds(data);
  const savedSubtitleTracks = getSavedSubtitleTracks(data)
  const targetLanguageKey = normalizeActiveSubtitleLanguage(languageKey || data.active_subtitle_language, savedSubtitleTracks)
  const {
    performAutoSave,
    sessionIdRef,
    setIsTranslating,
    setActiveSubtitleLanguage,
    setSubtitleTracks,
    setTranslateProgress,
    setTranslationJobId,
  } = dependencies;
  const updateTranslateProgress = (progress) => {
    if (sessionIdRef.current !== data.id) return;
    setTranslateProgress(progress);
  };

  if (!requestId || !outputFileName) {
    void performAutoSave({
      activeSubtitleLanguageData: data.active_subtitle_language || DEFAULT_SUBTITLE_LANGUAGE_KEY,
      deletedIdsData: deletedIds,
      scenesData: data.scenes || [],
      subtitleTracksData: savedSubtitleTracks,
      transJobId: data.transcription_job_id,
      translJobId: null,
    });
    return;
  }

  try {
    const snapshot = await getTranslationJobSnapshot(requestId);
    if (sessionIdRef.current !== data.id) return;

    if (snapshot.state === 'missing' || snapshot.state === 'failed') {
      setTranslationJobId(null);
      setIsTranslating(false);
      setTranslateProgress(null);
      void performAutoSave({
        activeSubtitleLanguageData: data.active_subtitle_language || DEFAULT_SUBTITLE_LANGUAGE_KEY,
        deletedIdsData: deletedIds,
        scenesData: data.scenes || [],
        subtitleTracksData: savedSubtitleTracks,
        transJobId: data.transcription_job_id,
        translJobId: null,
      });
      return;
    }

    if (snapshot.state === 'finished') {
      updateTranslateProgress({ phase: 'Downloading results...', percent: 90 });
      const nextSubtitles = await downloadTranslatedSubtitles(requestId, outputFileName);
      if (sessionIdRef.current !== data.id) return;

      const nextSubtitleTracks = setSubtitleTrackSubtitles(savedSubtitleTracks, targetLanguageKey, nextSubtitles)
      setSubtitleTracks(nextSubtitleTracks);
      setActiveSubtitleLanguage(targetLanguageKey);
      setTranslationJobId(null);
      setIsTranslating(false);
      setTranslateProgress(null);
      void performAutoSave({
        activeSubtitleLanguageData: targetLanguageKey,
        deletedIdsData: deletedIds,
        scenesData: data.scenes || [],
        subtitleTracksData: nextSubtitleTracks,
        transJobId: data.transcription_job_id,
        translJobId: null,
      });
      return;
    }

    setTranslationJobId(data.translation_job_id);
    setIsTranslating(true);
    updateTranslateProgress({ phase: 'Resuming translation...', percent: 30 });

    const nextSubtitles = await resumeTranslation(requestId, outputFileName, updateTranslateProgress, { initialDelayMs: 0 });
    if (sessionIdRef.current !== data.id) return;

    const nextSubtitleTracks = setSubtitleTrackSubtitles(savedSubtitleTracks, targetLanguageKey, nextSubtitles)
    setSubtitleTracks(nextSubtitleTracks);
    setActiveSubtitleLanguage(targetLanguageKey);
    setTranslationJobId(null);
    setIsTranslating(false);
    setTranslateProgress(null);
    void performAutoSave({
      activeSubtitleLanguageData: targetLanguageKey,
      deletedIdsData: deletedIds,
      scenesData: data.scenes || [],
      subtitleTracksData: nextSubtitleTracks,
      transJobId: data.transcription_job_id,
      translJobId: null,
    });
  } catch (error) {
    if (sessionIdRef.current !== data.id) return;

    console.error('Failed to resume subtitle translation:', error);
    setTranslationJobId(null);
    setIsTranslating(false);
    setTranslateProgress(null);
    void performAutoSave({
      activeSubtitleLanguageData: data.active_subtitle_language || DEFAULT_SUBTITLE_LANGUAGE_KEY,
      deletedIdsData: deletedIds,
      scenesData: data.scenes || [],
      subtitleTracksData: savedSubtitleTracks,
      transJobId: data.transcription_job_id,
      translJobId: null,
    });
  }
}