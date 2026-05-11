import { getFFmpeg } from '../utils/ffmpegManager';
import { transcribeVideo } from '../utils/audioExtractor';
import { saveLocalProjectVoiceoverAudio } from '../utils/projectStorage';
import { buildTranslationJobId, translateSubtitles } from '../utils/subtitleUtils';
import { createVoiceoverFromSubtitles } from '../utils/voiceoverUtils';
import {
  DEFAULT_SUBTITLE_LANGUAGE_KEY,
  getSubtitleLanguageLabel,
  isVoiceoverSubtitleLanguageSupported,
  isTranslatableSubtitleLanguage,
  normalizeVoiceoverLanguageKey,
  setSubtitleTrackSubtitles,
} from '../utils/subtitleTracks';

export async function runTranscriptionJob({
  videoFile,
  videoDuration,
  sessionIdRef,
  pushState,
  getCurrentSnapshot,
  setIsTranscribing,
  setTranscribeProgress,
  setTranscriptionJobId,
  scenes,
  deletedSceneIds,
  subtitleTracks,
  activeSubtitleLanguage,
  translationJobId,
  performAutoSave,
  setSubtitleTracks,
  setActiveSubtitleLanguage,
}) {
  if (!videoFile) {
    return;
  }

  const currentSessionId = sessionIdRef.current;
  const updateTranscribeProgress = (progress) => {
    if (sessionIdRef.current !== currentSessionId) {
      return;
    }

    setTranscribeProgress(progress);
  };

  pushState(getCurrentSnapshot());
  setIsTranscribing(true);
  setTranscribeProgress({ phase: 'Loading tools...', percent: 0 });

  try {
    const ffmpeg = await getFFmpeg((progress) => {
      updateTranscribeProgress({ phase: 'Loading tools...', percent: progress });
    });
    const nextSubtitles = await transcribeVideo(
      ffmpeg,
      videoFile,
      videoDuration,
      updateTranscribeProgress,
      (jobId) => {
        if (sessionIdRef.current !== currentSessionId) {
          return;
        }

        setTranscriptionJobId(jobId);
        performAutoSave({
          activeSubtitleLanguageData: activeSubtitleLanguage,
          deletedIdsData: Array.from(deletedSceneIds),
          scenesData: scenes,
          subtitleTracksData: subtitleTracks,
          transJobId: jobId,
          translJobId: translationJobId,
        });
      },
    );

    if (sessionIdRef.current !== currentSessionId) {
      return;
    }

    const nextSubtitleTracks = setSubtitleTrackSubtitles(
      subtitleTracks,
      DEFAULT_SUBTITLE_LANGUAGE_KEY,
      nextSubtitles,
    );

    setSubtitleTracks(nextSubtitleTracks);
    setActiveSubtitleLanguage(DEFAULT_SUBTITLE_LANGUAGE_KEY);
    setTranscriptionJobId(null);
    performAutoSave({
      activeSubtitleLanguageData: DEFAULT_SUBTITLE_LANGUAGE_KEY,
      deletedIdsData: Array.from(deletedSceneIds),
      scenesData: scenes,
      subtitleTracksData: nextSubtitleTracks,
      transJobId: null,
      translJobId: translationJobId,
    });
  } catch (error) {
    if (sessionIdRef.current !== currentSessionId) {
      return;
    }

    console.error(error);
    alert(`Subtitle generation failed: ${error.message}`);
    setTranscriptionJobId(null);
  } finally {
    if (sessionIdRef.current === currentSessionId) {
      setIsTranscribing(false);
      setTranscribeProgress(null);
    }
  }
}

export async function runTranslationJob({
  originalSubtitles,
  subtitleTracks,
  activeSubtitleLanguage,
  sessionIdRef,
  pushState,
  getCurrentSnapshot,
  setIsTranslating,
  setTranslateProgress,
  setTranslationJobId,
  scenes,
  deletedSceneIds,
  transcriptionJobId,
  performAutoSave,
  setSubtitleTracks,
  setActiveSubtitleLanguage,
  targetLanguageKey,
}) {
  if (!Array.isArray(originalSubtitles) || originalSubtitles.length === 0 || !isTranslatableSubtitleLanguage(targetLanguageKey)) {
    return;
  }

  const normalizedTargetLanguageKey = targetLanguageKey;
  const targetLanguageLabel = getSubtitleLanguageLabel(normalizedTargetLanguageKey);

  const currentSessionId = sessionIdRef.current;
  const updateTranslateProgress = (progress) => {
    if (sessionIdRef.current !== currentSessionId) {
      return;
    }

    setTranslateProgress(progress);
  };

  pushState(getCurrentSnapshot());
  setIsTranslating(true);
  setTranslateProgress({ phase: 'Starting translation...', percent: 0 });

  try {
    const nextSubtitles = await translateSubtitles(
      originalSubtitles,
      targetLanguageLabel,
      updateTranslateProgress,
      (requestId, outputFileName) => {
        if (sessionIdRef.current !== currentSessionId) {
          return;
        }

        const jobId = buildTranslationJobId(normalizedTargetLanguageKey, requestId, outputFileName);
        setTranslationJobId(jobId);
        performAutoSave({
          activeSubtitleLanguageData: activeSubtitleLanguage,
          deletedIdsData: Array.from(deletedSceneIds),
          scenesData: scenes,
          subtitleTracksData: subtitleTracks,
          transJobId: transcriptionJobId,
          translJobId: jobId,
        });
      },
    );

    if (sessionIdRef.current !== currentSessionId) {
      return;
    }

    const nextSubtitleTracks = setSubtitleTrackSubtitles(
      subtitleTracks,
      normalizedTargetLanguageKey,
      nextSubtitles,
    );

    setSubtitleTracks(nextSubtitleTracks);
    setActiveSubtitleLanguage(normalizedTargetLanguageKey);
    setTranslationJobId(null);
    performAutoSave({
      activeSubtitleLanguageData: normalizedTargetLanguageKey,
      deletedIdsData: Array.from(deletedSceneIds),
      scenesData: scenes,
      subtitleTracksData: nextSubtitleTracks,
      transJobId: transcriptionJobId,
      translJobId: null,
    });
  } catch (error) {
    if (sessionIdRef.current !== currentSessionId) {
      return;
    }

    console.error(error);
    alert(`Subtitle translation failed: ${error.message}`);
    setTranslationJobId(null);
  } finally {
    if (sessionIdRef.current === currentSessionId) {
      setIsTranslating(false);
      setTranslateProgress(null);
    }
  }
}

export async function runVoiceoverJob({
  activeSubtitleLanguage,
  subtitles,
  sessionIdRef,
  setIsGeneratingVoiceover,
  setVoiceoverProgress,
  setLastVoiceoverAudioName,
  setVoiceoverTrack,
}) {
  if (!Array.isArray(subtitles) || subtitles.length === 0 || !isVoiceoverSubtitleLanguageSupported(activeSubtitleLanguage)) {
    return;
  }

  const voiceoverLanguageKey = normalizeVoiceoverLanguageKey(activeSubtitleLanguage)

  const currentSessionId = sessionIdRef.current;
  if (!currentSessionId) {
    throw new Error('No active project found to save voiceover audio.')
  }

  const updateVoiceoverProgress = (progress) => {
    if (sessionIdRef.current !== currentSessionId) {
      return;
    }

    setVoiceoverProgress(progress);
  };

  setIsGeneratingVoiceover(true);
  setVoiceoverProgress({ phase: 'Starting voiceover...', percent: 0 });
  setLastVoiceoverAudioName('');

  try {
    const result = await createVoiceoverFromSubtitles(subtitles, updateVoiceoverProgress);
    if (sessionIdRef.current !== currentSessionId) {
      return;
    }

  updateVoiceoverProgress({ phase: 'Saving audio to project...', percent: 95 });
    const savedVoiceover = await saveLocalProjectVoiceoverAudio(currentSessionId, {
      bytes: result.audioBlob,
      duration: result.duration,
      fileName: result.fileName || 'voiceover.mp3',
      languageKey: voiceoverLanguageKey,
      mimeType: result.mimeType || 'audio/mpeg',
    });

    if (sessionIdRef.current !== currentSessionId) {
      return;
    }

    const fileName = savedVoiceover.fileName || result.fileName || 'voiceover.mp3';
    const previewUrl = result.audioBlob ? URL.createObjectURL(result.audioBlob) : null;

    setLastVoiceoverAudioName(fileName);
    setVoiceoverTrack(previewUrl ? {
      duration: savedVoiceover.duration || result.duration || 0,
      fileName,
      languageKey: savedVoiceover.languageKey || voiceoverLanguageKey,
      previewUrl,
      startTime: 0,
    } : null);
    updateVoiceoverProgress({ phase: 'Audio saved to project', percent: 100 });
  } catch (error) {
    if (sessionIdRef.current !== currentSessionId) {
      return;
    }

    console.error(error);
    alert(`Voiceover generation failed: ${error.message}`);
  } finally {
    if (sessionIdRef.current === currentSessionId) {
      setIsGeneratingVoiceover(false);
      setVoiceoverProgress(null);
    }
  }
}
