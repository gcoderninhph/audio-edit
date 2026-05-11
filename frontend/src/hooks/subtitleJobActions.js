import { getFFmpeg } from '../utils/ffmpegManager';
import { transcribeVideo } from '../utils/audioExtractor';
import { saveLocalProjectVoiceoverAudio } from '../utils/projectStorage';
import { translateSubtitles } from '../utils/subtitleUtils';
import { createVoiceoverFromSubtitles } from '../utils/voiceoverUtils';

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
  subtitles,
  translationJobId,
  performAutoSave,
  setSubtitles,
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
  setTranscribeProgress({ phase: 'Dang tai bo cong cu...', percent: 0 });

  try {
    const ffmpeg = await getFFmpeg((progress) => {
      updateTranscribeProgress({ phase: 'Dang tai bo cong cu...', percent: progress });
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
        performAutoSave(
          scenes,
          Array.from(deletedSceneIds),
          subtitles,
          jobId,
          translationJobId,
        );
      },
    );

    if (sessionIdRef.current !== currentSessionId) {
      return;
    }

    setSubtitles(nextSubtitles);
    setTranscriptionJobId(null);
    performAutoSave(
      scenes,
      Array.from(deletedSceneIds),
      nextSubtitles,
      null,
      translationJobId,
    );
  } catch (error) {
    if (sessionIdRef.current !== currentSessionId) {
      return;
    }

    console.error(error);
    alert(`Loi tao phu de: ${error.message}`);
    setTranscriptionJobId(null);
  } finally {
    if (sessionIdRef.current === currentSessionId) {
      setIsTranscribing(false);
      setTranscribeProgress(null);
    }
  }
}

export async function runTranslationJob({
  subtitles,
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
  setSubtitles,
  targetLanguage,
}) {
  if (!Array.isArray(subtitles) || subtitles.length === 0) {
    return;
  }

  const currentSessionId = sessionIdRef.current;
  const updateTranslateProgress = (progress) => {
    if (sessionIdRef.current !== currentSessionId) {
      return;
    }

    setTranslateProgress(progress);
  };

  pushState(getCurrentSnapshot());
  setIsTranslating(true);
  setTranslateProgress({ phase: 'Khoi tao dich...', percent: 0 });

  try {
    const nextSubtitles = await translateSubtitles(
      subtitles,
      targetLanguage,
      updateTranslateProgress,
      (requestId, outputFileName) => {
        if (sessionIdRef.current !== currentSessionId) {
          return;
        }

        const jobId = `${requestId}|${outputFileName}`;
        setTranslationJobId(jobId);
        performAutoSave(
          scenes,
          Array.from(deletedSceneIds),
          subtitles,
          transcriptionJobId,
          jobId,
        );
      },
    );

    if (sessionIdRef.current !== currentSessionId) {
      return;
    }

    setSubtitles(nextSubtitles);
    setTranslationJobId(null);
    performAutoSave(
      scenes,
      Array.from(deletedSceneIds),
      nextSubtitles,
      transcriptionJobId,
      null,
    );
  } catch (error) {
    if (sessionIdRef.current !== currentSessionId) {
      return;
    }

    console.error(error);
    alert(`Loi dich phu de: ${error.message}`);
    setTranslationJobId(null);
  } finally {
    if (sessionIdRef.current === currentSessionId) {
      setIsTranslating(false);
      setTranslateProgress(null);
    }
  }
}

export async function runVoiceoverJob({
  subtitles,
  sessionIdRef,
  setIsGeneratingVoiceover,
  setVoiceoverProgress,
  setLastVoiceoverAudioName,
  setVoiceoverTrack,
}) {
  if (!Array.isArray(subtitles) || subtitles.length === 0) {
    return;
  }

  const currentSessionId = sessionIdRef.current;
  if (!currentSessionId) {
    throw new Error('Khong tim thay project hien tai de luu audio thuyet minh.')
  }

  const updateVoiceoverProgress = (progress) => {
    if (sessionIdRef.current !== currentSessionId) {
      return;
    }

    setVoiceoverProgress(progress);
  };

  setIsGeneratingVoiceover(true);
  setVoiceoverProgress({ phase: 'Khoi tao thuyet minh...', percent: 0 });
  setLastVoiceoverAudioName('');

  try {
    const result = await createVoiceoverFromSubtitles(subtitles, updateVoiceoverProgress);
    if (sessionIdRef.current !== currentSessionId) {
      return;
    }

    updateVoiceoverProgress({ phase: 'Dang luu audio vao project...', percent: 95 });
    const savedVoiceover = await saveLocalProjectVoiceoverAudio(currentSessionId, {
      bytes: result.audioBlob,
      duration: result.duration,
      fileName: result.fileName || 'voiceover.mp3',
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
      previewUrl,
      startTime: 0,
    } : null);
    updateVoiceoverProgress({ phase: 'Da luu audio vao project', percent: 100 });
  } catch (error) {
    if (sessionIdRef.current !== currentSessionId) {
      return;
    }

    console.error(error);
    alert(`Loi tao thuyet minh: ${error.message}`);
  } finally {
    if (sessionIdRef.current === currentSessionId) {
      setIsGeneratingVoiceover(false);
      setVoiceoverProgress(null);
    }
  }
}
