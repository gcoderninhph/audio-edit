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

// Quản lý tiến trình dịch với LLM-Subtrans
export async function translateSubtitles(subtitles, targetLanguage, onProgress) {
  if (!subtitles || subtitles.length === 0) {
    throw new Error('Không có phụ đề để dịch');
  }

  try {
    // 1. Convert JSON to SRT Blob
    onProgress({ phase: 'Đang chuẩn bị file...', percent: 0 });
    const srtText = jsonToSrt(subtitles);
    const srtBlob = new Blob([srtText], { type: 'text/plain' });
    const srtFile = new File([srtBlob], 'subtitles_vi.srt', { type: 'text/plain' });

    // 2. Upload file to start translation
    onProgress({ phase: 'Đang gửi yêu cầu dịch...', percent: 10 });
    const formData = new FormData();
    formData.append('subtitle_file', srtFile);
    formData.append('target_language', targetLanguage);

    const startRes = await fetch('/api/translation/start', {
      method: 'POST',
      body: formData
    });

    if (!startRes.ok) {
      const errorData = await startRes.json().catch(() => ({}));
      throw new Error(errorData.detail?.message || 'Lỗi khi khởi tạo quá trình dịch');
    }

    const startData = await startRes.json();
    const requestId = startData.requestId;
    const outputFileName = startData.outputFileName;

    if (!requestId) {
      throw new Error('LLM-Subtrans không trả về Request ID');
    }

    // 3. Polling status
    onProgress({ phase: 'Đang dịch (Việc này có thể mất vài phút)...', percent: 30 });
    let isFinished = false;

    while (!isFinished) {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const statusRes = await fetch(`/api/translation/status/${requestId}`);
      if (!statusRes.ok) continue;

      const statusData = await statusRes.json();
      
      if (statusData.status === 'finished') {
        isFinished = true;
      } else if (statusData.status === 'failed') {
        throw new Error('Quá trình dịch thất bại (LLM-Subtrans Error)');
      } else if (statusData.status === 'running') {
        // Có thể update tiến trình hoặc log text ở đây nếu cần
        onProgress({ phase: 'AI đang xử lý dịch thuật...', percent: 60 });
      }
    }

    // 4. Download file
    onProgress({ phase: 'Đang tải kết quả...', percent: 90 });
    const downloadRes = await fetch(`/api/translation/download/${requestId}/${outputFileName}`);
    
    if (!downloadRes.ok) {
      throw new Error('Không thể tải file phụ đề sau khi dịch xong');
    }

    const translatedSrtText = await downloadRes.text();
    
    // 5. Parse back to JSON
    const translatedSubtitles = srtToJson(translatedSrtText);
    
    onProgress({ phase: 'Hoàn tất!', percent: 100 });
    return translatedSubtitles;

  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}
