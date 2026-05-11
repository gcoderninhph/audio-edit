import { apiFetch } from './runtimeConfig';
import { DEFAULT_TRANSLATION_LANGUAGE_KEY, normalizeSubtitleLanguageKey } from './subtitleTracks';

function normalizeTranslationErrorMessage(message, fallbackMessage) {
  const normalizedMessage = String(message || '').trim();
  if (!normalizedMessage) {
    return fallbackMessage;
  }

  if (/No available managed worker/i.test(normalizedMessage)) {
    return 'No translation worker is available. Create or start a managed worker in the LLM-Subtrans web admin panel before submitting a translation job.';
  }

  return normalizedMessage;
}

async function readApiErrorMessage(response, fallbackMessage) {
  const responseText = await response.text().catch(() => '');

  if (!responseText) {
    return fallbackMessage;
  }

  try {
    const payload = JSON.parse(responseText);
    return normalizeTranslationErrorMessage(
      payload?.detail?.message || payload?.message || payload?.error,
      fallbackMessage,
    );
  } catch {
    return normalizeTranslationErrorMessage(responseText, fallbackMessage);
  }
}

// Chuyển đổi giây thành định dạng thời gian SRT (HH:MM:SS,mmm)
function formatSrtTime(seconds) {
  const date = new Date(seconds * 1000);
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss},${ms}`;
}

// Phân tích định dạng thời gian SRT thành giây
function parseSrtTime(timeString) {
  const [time, ms] = timeString.split(',');
  const [hh, mm, ss] = time.split(':').map(Number);
  return hh * 3600 + mm * 60 + ss + Number(ms) / 1000;
}

// Chuyển mảng JSON Subtitles thành file văn bản SRT
export function jsonToSrt(subtitles) {
  return subtitles.map((sub, index) => {
    const start = formatSrtTime(sub.start);
    const end = formatSrtTime(sub.end);
    return `${index + 1}\n${start} --> ${end}\n${sub.text}\n`;
  }).join('\n');
}

// Chuyển nội dung SRT thành mảng JSON
export function srtToJson(srtText) {
  const blocks = srtText.trim().split(/\n\s*\n/);
  const subtitles = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length >= 3) {
      const timeLine = lines[1];
      const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
      
      if (timeMatch) {
        const start = parseSrtTime(timeMatch[1]);
        const end = parseSrtTime(timeMatch[2]);
        const text = lines.slice(2).join('\n').trim();
        
        subtitles.push({
          id: `trans_${subtitles.length}`,
          start,
          end,
          text
        });
      }
    }
  }
  return subtitles;
}

export function buildTranslationJobId(languageKey, requestId, outputFileName) {
  return `${normalizeSubtitleLanguageKey(languageKey)}|${requestId}|${outputFileName}`
}

export function parseTranslationJobId(jobId) {
  const parts = String(jobId || '').split('|')
  if (parts.length >= 3) {
    const [languageKey, requestId, ...outputFileNameParts] = parts
    return {
      languageKey: normalizeSubtitleLanguageKey(languageKey),
      outputFileName: outputFileNameParts.join('|'),
      requestId,
    }
  }

  if (parts.length === 2) {
    const [requestId, outputFileName] = parts
    return {
      languageKey: DEFAULT_TRANSLATION_LANGUAGE_KEY,
      outputFileName,
      requestId,
    }
  }

  return {
    languageKey: DEFAULT_TRANSLATION_LANGUAGE_KEY,
    outputFileName: '',
    requestId: '',
  }
}

// Quản lý tiến trình dịch với LLM-Subtrans
export async function translateSubtitles(subtitles, targetLanguage, onProgress, onJobCreated) {
  if (!subtitles || subtitles.length === 0) {
    throw new Error('No subtitles available to translate');
  }

  try {
    // 1. Convert JSON to SRT Blob
    onProgress({ phase: 'Preparing file...', percent: 0 });
    const srtText = jsonToSrt(subtitles);
    const srtBlob = new Blob([srtText], { type: 'text/plain' });
    const srtFile = new File([srtBlob], 'subtitles_vi.srt', { type: 'text/plain' });

    // 2. Upload file to start translation
    onProgress({ phase: 'Sending translation request...', percent: 10 });
    const formData = new FormData();
    formData.append('subtitle_file', srtFile);
    formData.append('target_language', targetLanguage);

    const startRes = await apiFetch('/api/translation/start', {
      method: 'POST',
      body: formData
    });

    if (!startRes.ok) {
      throw new Error(await readApiErrorMessage(startRes, 'Failed to start translation'));
    }

    const startData = await startRes.json();
    const requestId = startData.requestId;
    const outputFileName = startData.outputFileName;

    if (!requestId) {
      throw new Error('LLM-Subtrans did not return a request ID');
    }

    if (onJobCreated) {
      onJobCreated(requestId, outputFileName);
    }

    return await pollTranslationJob(requestId, outputFileName, onProgress);

  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}

export async function resumeTranslation(requestId, outputFileName, onProgress, options = {}) {
  onProgress({ phase: 'Resuming translation...', percent: 30 });
  return await pollTranslationJob(requestId, outputFileName, onProgress, {
    initialDelayMs: options.initialDelayMs ?? 3000,
  });
}

export async function getTranslationJobSnapshot(requestId) {
  const statusRes = await apiFetch(`/api/translation/status/${requestId}`);
  if (statusRes.status === 404) {
    return { state: 'missing' };
  }
  if (!statusRes.ok) {
    throw new Error(await readApiErrorMessage(statusRes, 'Unable to check translation job status'));
  }

  const statusData = await statusRes.json();
  if (statusData.status === 'finished') {
    return { state: 'finished' };
  }
  if (statusData.status === 'failed') {
    return {
      state: 'failed',
      message: statusData.message || 'Translation failed (LLM-Subtrans error)',
    };
  }

  return {
    state: 'running',
    status: statusData.status,
  };
}

export async function downloadTranslatedSubtitles(requestId, outputFileName) {
  const downloadRes = await apiFetch(`/api/translation/download/${requestId}/${outputFileName}`);

  if (!downloadRes.ok) {
    throw new Error(await readApiErrorMessage(downloadRes, 'Unable to download the translated subtitle file'));
  }

  const translatedSrtText = await downloadRes.text();
  return srtToJson(translatedSrtText);
}

async function pollTranslationJob(requestId, outputFileName, onProgress, { initialDelayMs = 3000 } = {}) {
  onProgress({ phase: 'Translating (this may take a few minutes)...', percent: 30 });
  let isFinished = false;
  let waitMilliseconds = initialDelayMs;

  while (!isFinished) {
    if (waitMilliseconds > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMilliseconds));
    }
    waitMilliseconds = 3000;

    const statusRes = await apiFetch(`/api/translation/status/${requestId}`);
    if (statusRes.status === 404) {
      throw new Error('The job does not exist (Job Not Found)');
    }
    if (!statusRes.ok) {
      throw new Error(await readApiErrorMessage(statusRes, 'Unable to check translation job status'));
    }

    const statusData = await statusRes.json();
    
    if (statusData.status === 'finished') {
      isFinished = true;
    } else if (statusData.status === 'failed') {
      throw new Error('Translation failed (LLM-Subtrans error)');
    } else if (statusData.status === 'running') {
      onProgress({ phase: 'AI is processing the translation...', percent: 60 });
    }
  }

  // Download file
  onProgress({ phase: 'Downloading results...', percent: 90 });
  const translatedSubtitles = await downloadTranslatedSubtitles(requestId, outputFileName);
  
  onProgress({ phase: 'Complete!', percent: 100 });
  return translatedSubtitles;
}
