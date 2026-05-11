import { apiFetch } from './runtimeConfig';
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
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      download_url: downloadUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Khong the tai audio thuyet minh tu Vbee'));
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

    const statusResponse = await apiFetch(`/api/voiceover/status/${requestId}`);
    if (statusResponse.status === 404) {
      throw new Error('Tien trinh thuyet minh khong ton tai');
    }
    if (!statusResponse.ok) {
      throw new Error(await readApiErrorMessage(statusResponse, 'Khong the kiem tra trang thai thuyet minh'));
    }

    const statusData = await statusResponse.json();
    const status = statusData.status;

    if (status === 'queued') {
      onProgress?.({ phase: 'Dang cho node Vbee xu ly...', percent: 30 });
      continue;
    }

    if (status === 'processing') {
      onProgress?.({ phase: 'Vbee dang tao audio...', percent: 65 });
      continue;
    }

    if (status === 'failed') {
      throw new Error(statusData.error_message || 'Tao thuyet minh that bai');
    }

    if (status === 'success') {
      const downloadUrl = statusData.download_url;
      if (!downloadUrl) {
        throw new Error('Vbee khong tra ve download_url');
      }

      onProgress?.({ phase: 'Dang lay audio tu Vbee...', percent: 90 });
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
    throw new Error('Khong co phu de de tao thuyet minh');
  }

  onProgress?.({ phase: 'Dang tong hop file SRT...', percent: 0 });
  const srtContent = jsonToSrt(subtitles);
  const srtFile = new File(
    [new Blob([srtContent], { type: 'application/x-subrip' })],
    'voiceover_subtitles.srt',
    { type: 'application/x-subrip' },
  );

  const formData = new FormData();
  formData.append('file', srtFile);

  onProgress?.({ phase: 'Dang gui yeu cau toi Vbee...', percent: 10 });
  const startResponse = await apiFetch('/api/voiceover/start', {
    method: 'POST',
    body: formData,
  });

  if (!startResponse.ok) {
    throw new Error(await readApiErrorMessage(startResponse, 'Khong the khoi tao job thuyet minh'));
  }

  const startData = await startResponse.json();
  const requestId = startData.request_id || startData.requestId;

  if (!requestId) {
    throw new Error('Vbee Router khong tra ve request_id');
  }

  if (startData.status === 'queued') {
    onProgress?.({ phase: 'Job dang xep hang tai Vbee...', percent: 20 });
  } else {
    onProgress?.({ phase: 'Vbee da nhan job, dang xu ly...', percent: 35 });
  }

  return pollVoiceoverJob(requestId, onProgress);
}
