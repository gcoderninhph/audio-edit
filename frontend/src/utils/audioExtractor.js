export async function transcribeVideo(ffmpeg, videoFile, duration, onProgress) {
  try {
    const CHUNK_DURATION = 300; // 5 minutes
    const chunksCount = Math.ceil(duration / CHUNK_DURATION);
    const allSubtitles = [];

    // Write original video to memory
    const inputName = 'input_audio_extract.mp4';
    const videoData = await videoFile.arrayBuffer();
    await ffmpeg.writeFile(inputName, new Uint8Array(videoData));

    for (let i = 0; i < chunksCount; i++) {
      const startTime = i * CHUNK_DURATION;
      const chunkName = `chunk_${i}.mp3`;
      
      onProgress({ phase: `Đang cắt audio (phần ${i + 1}/${chunksCount})...`, percent: 0 });

      // Cắt audio
      await ffmpeg.exec([
        '-i', inputName,
        '-ss', startTime.toString(),
        '-t', CHUNK_DURATION.toString(),
        '-vn', // no video
        '-acodec', 'libmp3lame',
        '-q:a', '2', // good quality
        chunkName
      ]);

      const chunkData = await ffmpeg.readFile(chunkName);
      const chunkBlob = new Blob([chunkData.buffer], { type: 'audio/mp3' });
      const chunkFile = new File([chunkBlob], chunkName, { type: 'audio/mp3' });

      // Xóa file mp3 tạm
      await ffmpeg.deleteFile(chunkName);

      onProgress({ phase: `Đang gửi yêu cầu tạo phụ đề (phần ${i + 1}/${chunksCount})...`, percent: 20 });
      
      const segments = await processChunkWithWhisper(chunkFile, startTime);
      allSubtitles.push(...segments);
    }

    // Xóa file input tạm
    await ffmpeg.deleteFile(inputName);

    onProgress({ phase: 'Hoàn tất phụ đề!', percent: 100 });
    return allSubtitles;

  } catch (error) {
    console.error('Lỗi khi transcribe:', error);
    throw error;
  }
}

async function processChunkWithWhisper(file, startTimeOffset) {
  // 1. Gửi file lấy Job ID
  const formData = new FormData();
  formData.append('file', file);

  const startRes = await fetch('/api/transcription/start', {
    method: 'POST',
    body: formData
  });

  if (!startRes.ok) {
    throw new Error('Không thể khởi tạo Whisper Job');
  }

  const startData = await startRes.json();
  const jobId = startData.id;

  if (!jobId) {
    throw new Error('Whisper không trả về Job ID');
  }

  // 2. Polling mỗi 3 giây
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 3000));

    const statusRes = await fetch(`/api/transcription/status/${jobId}`);
    if (!statusRes.ok) continue;

    const statusData = await statusRes.json();
    
    // status: 2 == done, -1 == error
    if (statusData.status === 2) {
      const segments = statusData.result?.segments || [];
      // Cộng dồn thời gian (Offset)
      return segments.map((seg, index) => ({
        id: seg.id || `sub_${startTimeOffset}_${index}`,
        start: seg.start + startTimeOffset,
        end: seg.end + startTimeOffset,
        text: seg.text.trim()
      }));
    } else if (statusData.status === -1) {
      throw new Error('Whisper job thất bại');
    }
    // Các trạng thái khác (0, 1) tiếp tục chờ...
  }
}
