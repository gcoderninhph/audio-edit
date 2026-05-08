import { getTranscriptionJobSnapshot, resumeTranscription } from '../utils/audioExtractor';
import {
  downloadTranslatedSubtitles,
  getTranslationJobSnapshot,
  resumeTranslation,
} from '../utils/subtitleUtils';

function getSavedDeletedIds(data) {
  return Array.from(new Set(data.deleted_ids || []));
}

export async function restoreSavedTranscriptionJob(data, dependencies) {
  if (!data.transcription_job_id) return;

  const deletedIds = getSavedDeletedIds(data);
  const {
    performAutoSave,
    sessionIdRef,
    setIsTranscribing,
    setSubtitles,
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
      void performAutoSave(data.scenes || [], deletedIds, data.subtitles || [], null, data.translation_job_id);
      return;
    }

    if (snapshot.state === 'finished') {
      setSubtitles(snapshot.subtitles);
      setTranscriptionJobId(null);
      setIsTranscribing(false);
      setTranscribeProgress(null);
      void performAutoSave(data.scenes || [], deletedIds, snapshot.subtitles, null, data.translation_job_id);
      return;
    }

    setTranscriptionJobId(data.transcription_job_id);
    setIsTranscribing(true);
    updateTranscribeProgress({ phase: 'Đang tiếp tục tiến trình tạo phụ đề...', percent: 30 });

    const nextSubtitles = await resumeTranscription(data.transcription_job_id, updateTranscribeProgress, { initialDelayMs: 0 });
    if (sessionIdRef.current !== data.id) return;

    setSubtitles(nextSubtitles);
    setTranscriptionJobId(null);
    setIsTranscribing(false);
    setTranscribeProgress(null);
    void performAutoSave(data.scenes || [], deletedIds, nextSubtitles, null, data.translation_job_id);
  } catch (error) {
    if (sessionIdRef.current !== data.id) return;

    console.error('Lỗi resume tạo phụ đề:', error);
    setTranscriptionJobId(null);
    setIsTranscribing(false);
    setTranscribeProgress(null);
    void performAutoSave(data.scenes || [], deletedIds, data.subtitles || [], null, data.translation_job_id);
  }
}

export async function restoreSavedTranslationJob(data, dependencies) {
  if (!data.translation_job_id) return;

  const [requestId, outputFileName] = data.translation_job_id.split('|');
  const deletedIds = getSavedDeletedIds(data);
  const {
    performAutoSave,
    sessionIdRef,
    setIsTranslating,
    setSubtitles,
    setTranslateProgress,
    setTranslationJobId,
  } = dependencies;
  const updateTranslateProgress = (progress) => {
    if (sessionIdRef.current !== data.id) return;
    setTranslateProgress(progress);
  };

  if (!requestId || !outputFileName) {
    void performAutoSave(data.scenes || [], deletedIds, data.subtitles || [], data.transcription_job_id, null);
    return;
  }

  try {
    const snapshot = await getTranslationJobSnapshot(requestId);
    if (sessionIdRef.current !== data.id) return;

    if (snapshot.state === 'missing' || snapshot.state === 'failed') {
      setTranslationJobId(null);
      setIsTranslating(false);
      setTranslateProgress(null);
      void performAutoSave(data.scenes || [], deletedIds, data.subtitles || [], data.transcription_job_id, null);
      return;
    }

    if (snapshot.state === 'finished') {
      updateTranslateProgress({ phase: 'Đang tải kết quả...', percent: 90 });
      const nextSubtitles = await downloadTranslatedSubtitles(requestId, outputFileName);
      if (sessionIdRef.current !== data.id) return;

      setSubtitles(nextSubtitles);
      setTranslationJobId(null);
      setIsTranslating(false);
      setTranslateProgress(null);
      void performAutoSave(data.scenes || [], deletedIds, nextSubtitles, data.transcription_job_id, null);
      return;
    }

    setTranslationJobId(data.translation_job_id);
    setIsTranslating(true);
    updateTranslateProgress({ phase: 'Đang tiếp tục tiến trình dịch...', percent: 30 });

    const nextSubtitles = await resumeTranslation(requestId, outputFileName, updateTranslateProgress, { initialDelayMs: 0 });
    if (sessionIdRef.current !== data.id) return;

    setSubtitles(nextSubtitles);
    setTranslationJobId(null);
    setIsTranslating(false);
    setTranslateProgress(null);
    void performAutoSave(data.scenes || [], deletedIds, nextSubtitles, data.transcription_job_id, null);
  } catch (error) {
    if (sessionIdRef.current !== data.id) return;

    console.error('Lỗi resume dịch phụ đề:', error);
    setTranslationJobId(null);
    setIsTranslating(false);
    setTranslateProgress(null);
    void performAutoSave(data.scenes || [], deletedIds, data.subtitles || [], data.transcription_job_id, null);
  }
}