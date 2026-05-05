/**
 * Client-side Scene Detection using Canvas Pixel Difference
 * 
 * Algorithm:
 * 1. Load video into hidden <video> element
 * 2. Create small canvas (160x90) for fast downscaled frame analysis
 * 3. Seek through video at intervals (every ~0.15s)
 * 4. Compare grayscale pixel differences between consecutive frames
 * 5. Use adaptive threshold (mean + sensitivity * stddev) to detect scene boundaries
 * 6. Merge very short scenes (< 0.5s) into previous scene
 */

/**
 * Detect scenes in a video file
 * @param {File} videoFile - The video file to analyze
 * @param {Object} options
 * @param {number} options.sensitivity - Detection sensitivity multiplier (default: 2.5, lower = more scenes)
 * @param {number} options.stepTime - Time between frame samples in seconds (default: 0.15)
 * @param {number} options.minSceneDuration - Minimum scene duration in seconds (default: 0.5)
 * @param {function} options.onProgress - Progress callback (0-100)
 * @returns {Promise<Array<{id: number, start: number, end: number, duration: number}>>}
 */
export async function detectScenes(videoFile, options = {}) {
  const {
    sensitivity = 2.5,
    stepTime = 0.15,
    minSceneDuration = 0.5,
    onProgress = () => { },
  } = options;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';

    const canvas = document.createElement('canvas');
    const ANALYSIS_WIDTH = 160;
    const ANALYSIS_HEIGHT = 90;
    canvas.width = ANALYSIS_WIDTH;
    canvas.height = ANALYSIS_HEIGHT;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    let previousFrameData = null;
    const differences = [];
    const timestamps = [];
    let duration = 0;

    video.addEventListener('error', () => {
      reject(new Error('Failed to load video file'));
    });

    video.addEventListener('loadedmetadata', () => {
      duration = video.duration;
      if (duration <= 0 || !isFinite(duration)) {
        reject(new Error('Invalid video duration'));
        return;
      }

      // Start fast playback
      video.playbackRate = 16.0; // Play at 16x speed (max supported by most modern browsers)
      video.play().catch(e => reject(new Error('Playback failed: ' + e.message)));

      // Use modern requestVideoFrameCallback for high-speed sequential decoding
      if ('requestVideoFrameCallback' in video) {
        const processFrame = (now, metadata) => {
          if (video.ended || metadata.mediaTime >= duration - 0.1) {
            finishDetection();
            return;
          }

          analyzeCurrentFrame(metadata.mediaTime);

          const progress = Math.min((metadata.mediaTime / duration) * 100, 100);
          onProgress(Math.round(progress));

          video.requestVideoFrameCallback(processFrame);
        };
        video.requestVideoFrameCallback(processFrame);
      } else {
        // Fallback for older browsers: use manual seeking
        let currentTime = 0;
        video.currentTime = currentTime;

        video.addEventListener('seeked', () => {
          analyzeCurrentFrame(currentTime);

          currentTime += stepTime;
          const progress = Math.min((currentTime / duration) * 100, 100);
          onProgress(Math.round(progress));

          if (currentTime < duration) {
            setTimeout(() => {
              video.currentTime = Math.min(currentTime, duration - 0.01);
            }, 0);
          } else {
            finishDetection();
          }
        });
      }
    });

    const analyzeCurrentFrame = (time) => {
      ctx.drawImage(video, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
      const imageData = ctx.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
      const currentFrameData = calculateHistogram(imageData.data);

      if (previousFrameData) {
        const diff = calculateHistogramDifference(previousFrameData, currentFrameData);
        differences.push(diff);
        timestamps.push(time);
      }
      previousFrameData = currentFrameData;
    };

    const finishDetection = () => {
      video.pause();
      onProgress(100);
      const scenes = analyzeSceneChanges(differences, timestamps, duration, sensitivity, minSceneDuration);
      URL.revokeObjectURL(video.src);
      resolve(scenes);
    };

    video.src = URL.createObjectURL(videoFile);
  });
}

/**
 * Calculate Luma (Grayscale) normalized histogram from RGBA data
 */
function calculateHistogram(rgbaData) {
  const hist = new Float32Array(256);
  const totalPixels = rgbaData.length / 4;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const y = Math.round(rgbaData[idx] * 0.299 + rgbaData[idx + 1] * 0.587 + rgbaData[idx + 2] * 0.114);
    hist[Math.min(255, Math.max(0, y))]++;
  }

  // Normalize histogram to [0, 1] range for size-independent comparison
  for (let i = 0; i < 256; i++) {
    hist[i] /= totalPixels;
  }
  return hist;
}

/**
 * Calculate difference between two normalized histograms
 * Using Sum of Absolute Differences
 */
function calculateHistogramDifference(hist1, hist2) {
  let diff = 0;
  for (let i = 0; i < 256; i++) {
    diff += Math.abs(hist1[i] - hist2[i]);
  }
  return diff;
}

/**
 * Analyze frame differences to find scene boundaries
 * Uses adaptive threshold: mean + sensitivity * standard_deviation
 */
function analyzeSceneChanges(differences, timestamps, totalDuration, sensitivity, minSceneDuration) {
  if (differences.length === 0) {
    return [{ id: 0, start: 0, end: totalDuration, duration: totalDuration }];
  }

  // Calculate statistics
  const mean = differences.reduce((a, b) => a + b, 0) / differences.length;
  const variance = differences.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / differences.length;
  const stddev = Math.sqrt(variance);

  // Adaptive threshold
  const threshold = mean + sensitivity * stddev;

  // Find scene change points
  const sceneChanges = [0]; // First scene always starts at 0

  for (let i = 0; i < differences.length; i++) {
    if (differences[i] > threshold) {
      sceneChanges.push(timestamps[i]);
    }
  }

  // Build scene list
  let scenes = [];
  for (let i = 0; i < sceneChanges.length; i++) {
    const start = sceneChanges[i];
    const end = i < sceneChanges.length - 1 ? sceneChanges[i + 1] : totalDuration;
    const duration = end - start;
    scenes.push({ id: i, start, end, duration });
  }

  // Merge very short scenes into previous
  const mergedScenes = [];
  for (let i = 0; i < scenes.length; i++) {
    if (scenes[i].duration < minSceneDuration && mergedScenes.length > 0) {
      // Extend previous scene
      mergedScenes[mergedScenes.length - 1].end = scenes[i].end;
      mergedScenes[mergedScenes.length - 1].duration =
        mergedScenes[mergedScenes.length - 1].end - mergedScenes[mergedScenes.length - 1].start;
    } else {
      mergedScenes.push({ ...scenes[i] });
    }
  }

  // Re-index
  return mergedScenes.map((scene, idx) => ({ ...scene, id: idx }));
}

/**
 * Generate a thumbnail for a specific timestamp
 * @param {string} videoUrl - Object URL of the video
 * @param {number} time - Timestamp in seconds
 * @param {number} width - Thumbnail width
 * @param {number} height - Thumbnail height
 * @returns {Promise<string>} - Data URL of the thumbnail
 */
export function generateThumbnail(videoUrl, time, width = 192, height = 108) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';

    let isResolved = false;
    
    const cleanup = () => {
      video.src = '';
      video.load();
    };

    const finish = (result) => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        resolve(result);
      }
    };

    // Timeout fallback if seeking hangs
    const timeoutId = setTimeout(() => {
      console.warn(`generateThumbnail timeout at ${time}s`);
      finish('');
    }, 3000);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    video.addEventListener('seeked', () => {
      clearTimeout(timeoutId);
      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      finish(dataUrl);
    }, { once: true });

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(time, video.duration - 0.01);
    }, { once: true });

    video.addEventListener('error', () => {
      clearTimeout(timeoutId);
      finish('');
    }, { once: true });

    video.src = videoUrl;
  });
}
