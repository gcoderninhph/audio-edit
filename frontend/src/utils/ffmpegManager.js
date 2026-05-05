/**
 * FFmpeg.wasm Singleton Manager
 * 
 * Lazy-loads FFmpeg WASM core (~31MB) only when needed.
 * Handles video cutting and concatenation entirely in the browser.
 */
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance = null;
let isLoaded = false;
let isLoading = false;

/**
 * Get or create FFmpeg instance, lazy-load WASM core
 * @param {function} onProgress - Loading progress callback (0-100)
 * @returns {Promise<FFmpeg>}
 */
export async function getFFmpeg(onProgress = () => {}) {
  if (isLoaded && ffmpegInstance) {
    return ffmpegInstance;
  }

  if (isLoading) {
    // Wait for existing load to complete
    while (isLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    return ffmpegInstance;
  }

  isLoading = true;
  
  try {
    ffmpegInstance = new FFmpeg();

    ffmpegInstance.on('log', ({ message }) => {
      // Parse progress from FFmpeg logs
      if (message.includes('time=')) {
        const match = message.match(/time=(\d{2}):(\d{2}):(\d{2})/);
        if (match) {
          // Could parse time progress here if needed
        }
      }
    });

    const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm';
    
    onProgress(10);
    
    await ffmpegInstance.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
    });

    isLoaded = true;
    onProgress(100);
    return ffmpegInstance;
  } catch (error) {
    isLoading = false;
    ffmpegInstance = null;
    throw error;
  } finally {
    isLoading = false;
  }
}

/**
 * Check if FFmpeg is loaded
 */
export function isFFmpegReady() {
  return isLoaded;
}

/**
 * Export video with selected scenes (remove deleted scenes)
 * 
 * @param {File} inputFile - Original video file
 * @param {Array<{start: number, end: number}>} keptScenes - Scenes to keep (sorted by start time)
 * @param {function} onProgress - Progress callback ({ phase: string, percent: number })
 * @returns {Promise<{blob: Blob, url: string, size: number}>}
 */
export async function exportVideo(inputFile, keptScenes, onProgress = () => {}) {
  if (!keptScenes || keptScenes.length === 0) {
    throw new Error('No scenes to export');
  }

  const ffmpeg = await getFFmpeg((p) => onProgress({ phase: 'loading', percent: p }));
  
  onProgress({ phase: 'preparing', percent: 0 });

  try {
    // Write input file to virtual FS
    const inputData = await fetchFile(inputFile);
    await ffmpeg.writeFile('input.mp4', inputData);
    
    onProgress({ phase: 'cutting', percent: 10 });

    if (keptScenes.length === 1) {
      // Single scene — simple trim
      const scene = keptScenes[0];
      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-ss', String(scene.start),
        '-to', String(scene.end),
        '-c', 'copy',
        '-avoid_negative_ts', '1',
        'output.mp4'
      ]);
      onProgress({ phase: 'cutting', percent: 90 });
    } else {
      // Multiple scenes — cut each, then concatenate
      const segmentFiles = [];

      for (let i = 0; i < keptScenes.length; i++) {
        const scene = keptScenes[i];
        const segName = `seg_${i}.mp4`;
        
        await ffmpeg.exec([
          '-i', 'input.mp4',
          '-ss', String(scene.start),
          '-to', String(scene.end),
          '-c', 'copy',
          '-avoid_negative_ts', '1',
          segName
        ]);
        
        segmentFiles.push(segName);
        
        const cutProgress = 10 + ((i + 1) / keptScenes.length) * 60;
        onProgress({ phase: 'cutting', percent: Math.round(cutProgress) });
      }

      // Create concat list
      const concatContent = segmentFiles.map(f => `file '${f}'`).join('\n');
      await ffmpeg.writeFile('list.txt', new TextEncoder().encode(concatContent));

      // Concatenate segments
      onProgress({ phase: 'merging', percent: 75 });
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'list.txt',
        '-c', 'copy',
        'output.mp4'
      ]);

      // Cleanup segments
      for (const seg of segmentFiles) {
        try { await ffmpeg.deleteFile(seg); } catch (e) { /* ignore */ }
      }
      try { await ffmpeg.deleteFile('list.txt'); } catch (e) { /* ignore */ }
    }

    onProgress({ phase: 'reading', percent: 90 });

    // Read output
    const outputData = await ffmpeg.readFile('output.mp4');
    const blob = new Blob([outputData.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);

    // Cleanup
    try { await ffmpeg.deleteFile('input.mp4'); } catch (e) { /* ignore */ }
    try { await ffmpeg.deleteFile('output.mp4'); } catch (e) { /* ignore */ }

    onProgress({ phase: 'done', percent: 100 });

    return { blob, url, size: blob.size };
  } catch (error) {
    // Cleanup on error
    try { await ffmpeg.deleteFile('input.mp4'); } catch (e) { /* ignore */ }
    throw error;
  }
}
