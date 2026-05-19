import { logExportDebug } from './desktopLogger';

export function formatMicroseconds(microseconds) {
  const totalSeconds = Math.max(0, Math.floor((Number(microseconds) || 0) / 1000000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatMegabytes(bytes) {
  return `${(Math.max(0, Number(bytes) || 0) / (1024 * 1024)).toFixed(1)} MB`;
}

export function shouldPublishLogLine(message) {
  const normalized = String(message || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return [
    'error',
    'invalid',
    'time=',
    'frame=',
    'size=',
    'duration:',
    'stream mapping',
    'subtitle',
    'opening',
    'video:',
    'audio:',
    'press [q]',
  ].some((token) => normalized.includes(token));
}

export function emitExportLog(onProgress, phase, message, level = 'info') {
  void logExportDebug(message, { phase }, level);
  onProgress({
    phase,
    logEntry: {
      phase,
      level,
      message,
      timestamp: Date.now(),
    },
  });
}
