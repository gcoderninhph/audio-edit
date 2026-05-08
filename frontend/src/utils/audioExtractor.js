import { apiFetch } from './runtimeConfig';
import { materializeVideoFile } from './projectStorage';

function mapTranscriptionSegments(segments = []) {
  return segments.map((seg, index) => ({
    id: seg.id || `sub_${index}`,
    start: seg.start,
    end: seg.end,
    text: seg.text.trim(),
  }));
}

export async function transcribeVideo(ffmpeg, videoFile, duration, onProgress, onJobCreated) {
  try {
    onProgress({ phase: 'Đang tách audio...', percent: 0 });

    const inputName = 'input_audio_extract.mp4';
    const outputName = 'extracted_audio.mp3';

    const sourceVideoFile = await materializeVideoFile(videoFile);
    const videoData = await sourceVideoFile.arrayBuffer();
    await ffmpeg.writeFile(inputName, new Uint8Array(videoData));

    // Trích xuất toàn bộ audio
    await ffmpeg.exec([
      '-i', inputName,
      '-vn',
      '-acodec', 'libmp3lame',
      '-q:a', '2',
      outputName
    ]);

    const audioData = await ffmpeg.readFile(outputName);
    const audioBlob = new Blob([audioData.buffer], { type: 'audio/mp3' });
    const audioFile = new File([audioBlob], outputName, { type: 'audio/mp3' });

    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    onProgress({ phase: 'Đang gửi yêu cầu tạo phụ đề...', percent: 20 });

    // Gửi file lấy Job ID
    const formData = new FormData();
    formData.append('file', audioFile);

    const startRes = await apiFetch('/api/transcription/start', {
      method: 'POST',
      body: formData
    });

    if (!startRes.ok) throw new Error('Không thể khởi tạo Whisper Job');
    const startData = await startRes.json();
    const jobId = startData.id;

    if (!jobId) throw new Error('Whisper không trả về Job ID');

    if (onJobCreated) onJobCreated(jobId);

    return await pollTranscriptionJob(jobId, onProgress);

  } catch (error) {
    console.error('Lỗi khi transcribe:', error);
    throw error;
  }
}

export async function resumeTranscription(jobId, onProgress, options = {}) {
  onProgress({ phase: 'Đang tiếp tục tiến trình tạo phụ đề...', percent: 30 });
  return await pollTranscriptionJob(jobId, onProgress, {
    initialDelayMs: options.initialDelayMs ?? 3000,
  });
}

export async function getTranscriptionJobSnapshot(jobId) {
  const statusRes = await apiFetch(`/api/transcription/status/${jobId}`);
  if (statusRes.status === 404) {
    return { state: 'missing' };
  }
  if (!statusRes.ok) {
    throw new Error('Không thể kiểm tra trạng thái tiến trình tạo phụ đề');
  }

  const statusData = await statusRes.json();
  if (statusData.status === 2) {
    return {
      state: 'finished',
      subtitles: mapTranscriptionSegments(statusData.result?.segments || []),
    };
  }
  if (statusData.status === -1) {
    return {
      state: 'failed',
      message: 'Whisper job thất bại',
    };
  }

  return {
    state: 'running',
  };
}

async function pollTranscriptionJob(jobId, onProgress, { initialDelayMs = 3000 } = {}) {
  let waitMilliseconds = initialDelayMs;

  while (true) {
    if (waitMilliseconds > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMilliseconds));
    }
    waitMilliseconds = 3000;

    const statusRes = await apiFetch(`/api/transcription/status/${jobId}`);
    if (statusRes.status === 404) {
      throw new Error('Tiến trình không tồn tại (Job Not Found)');
    }
    if (!statusRes.ok) continue;

    const statusData = await statusRes.json();

    if (statusData.status === 2) {
      onProgress({ phase: 'Hoàn tất phụ đề!', percent: 100 });
      return mapTranscriptionSegments(statusData.result?.segments || []);
    } else if (statusData.status === -1) {
      throw new Error('Whisper job thất bại');
    } else {
      onProgress({ phase: 'AI đang xử lý audio...', percent: 50 });
    }
  }
}
