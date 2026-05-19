import { apiFetch } from './runtimeConfig';
import { getAuthRequestHeaders, updateStoredAuthCredits } from './authClient';
import { jsonToSrt } from './subtitleUtils';

function normalizeErrorMessage(message, fallbackMessage) {
  const normalizedMessage = String(message || '').trim();
  return normalizedMessage || fallbackMessage;
}

async function readApiErrorMessage(response, fallbackMessage) {
  const responseText = await response.text().catch(() => '');

  if (!responseText) {
    return fallbackMessage;
  }

  try {
    const payload = JSON.parse(responseText);
    return normalizeErrorMessage(
      payload?.detail || payload?.error || payload?.message || payload?.error_message,
      fallbackMessage,
    );
  } catch {
    return normalizeErrorMessage(responseText, fallbackMessage);
  }
}

function extractFileName(contentDisposition, fallbackFileName) {
  const headerValue = String(contentDisposition || '');
  const fileNameMatch = headerValue.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);

  if (!fileNameMatch) {
    return fallbackFileName;
  }

  return decodeURIComponent(fileNameMatch[1]).replace(/^"|"$/g, '');
}

async function readAudioDuration(audioBlob) {
  if (typeof document === 'undefined') {
    return 0;
  }

  const previewUrl = URL.createObjectURL(audioBlob);

  try {
    return await new Promise((resolve) => {
      const audioElement = document.createElement('audio');
      audioElement.preload = 'metadata';
      audioElement.onloadedmetadata = () => resolve(audioElement.duration || 0);
      audioElement.onerror = () => resolve(0);
      audioElement.src = previewUrl;
    });
  } finally {
    URL.revokeObjectURL(previewUrl);
  }
}

async function downloadVoiceoverAudio(downloadUrl, requestId) {
  const response = await apiFetch('/api/voiceover/download', {
    method: 'POST',
    headers: {
      ...getAuthRequestHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      download_url: downloadUrl,
      request_id: requestId,
    }),
  });

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Unable to download voiceover audio from Vbee'));
  }

  const fileName = extractFileName(
    response.headers.get('Content-Disposition'),
    `voiceover-${requestId}.mp3`,
  );
  const audioBlob = await response.blob();
  const duration = await readAudioDuration(audioBlob);

  return {
    audioBlob,
    duration,
    fileName,
    mimeType: response.headers.get('Content-Type') || audioBlob.type || 'audio/mpeg',
  };
}

async function pollVoiceoverJob(requestId, onProgress) {
  while (true) {
    await new Promise((resolve) => window.setTimeout(resolve, 500));

    const statusResponse = await apiFetch(`/api/voiceover/status/${requestId}`, {
      headers: getAuthRequestHeaders(),
    });
    if (statusResponse.status === 404) {
      throw new Error('The voiceover job does not exist');
    }
    if (!statusResponse.ok) {
      throw new Error(await readApiErrorMessage(statusResponse, 'Unable to check voiceover job status'));
    }

    const statusData = await statusResponse.json();
    const status = statusData.status;

    if (status === 'queued') {
      onProgress?.({ phase: 'Waiting for a Vbee worker...', percent: 30 });
      continue;
    }

    if (status === 'processing') {
      onProgress?.({ phase: 'Vbee is generating audio...', percent: 65 });
      continue;
    }

    if (status === 'failed') {
      throw new Error(statusData.error_message || 'Voiceover generation failed');
    }

    if (status === 'success') {
      const downloadUrl = statusData.download_url;
      if (!downloadUrl) {
        throw new Error('Vbee did not return a download_url');
      }

      onProgress?.({ phase: 'Downloading audio from Vbee...', percent: 90 });
      const downloadResult = await downloadVoiceoverAudio(downloadUrl, requestId);

      return {
        audioBlob: downloadResult.audioBlob,
        duration: downloadResult.duration,
        requestId,
        downloadUrl,
        fileName: downloadResult.fileName,
        mimeType: downloadResult.mimeType,
      };
    }
  }
}

export async function createVoiceoverFromSubtitles(subtitles, onProgress) {
  if (!Array.isArray(subtitles) || subtitles.length === 0) {
    throw new Error('No subtitles available to generate voiceover');
  }

  onProgress?.({ phase: 'Building SRT file...', percent: 0 });
  const srtContent = jsonToSrt(subtitles);
  const srtFile = new File(
    [new Blob([srtContent], { type: 'application/x-subrip' })],
    'voiceover_subtitles.srt',
    { type: 'application/x-subrip' },
  );

  const formData = new FormData();
  formData.append('file', srtFile);

  onProgress?.({ phase: 'Sending request to Vbee...', percent: 10 });
  const startResponse = await apiFetch('/api/voiceover/start', {
    method: 'POST',
    headers: getAuthRequestHeaders(),
    body: formData,
  });

  if (!startResponse.ok) {
    throw new Error(await readApiErrorMessage(startResponse, 'Unable to start the voiceover job'));
  }

  const startData = await startResponse.json();
  const nextCreditBalance = Number(startData.creditBalance);
  if (Number.isFinite(nextCreditBalance)) {
    updateStoredAuthCredits(nextCreditBalance);
  }
  const requestId = startData.request_id || startData.requestId;

  if (!requestId) {
    throw new Error('The Vbee router did not return a request_id');
  }

  if (startData.status === 'queued') {
    onProgress?.({ phase: 'The job is queued at Vbee...', percent: 20 });
  } else {
    onProgress?.({ phase: 'Vbee accepted the job and is processing...', percent: 35 });
  }

  return pollVoiceoverJob(requestId, onProgress);
}
