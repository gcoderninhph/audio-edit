import { isPremiumActiveForUser } from './authClient';

function normalizePremiumTimestamp(value) {
  const timestamp = Number(value) || 0;
  if (timestamp <= 0) {
    return 0;
  }
  return timestamp > 100000000000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
}

export function formatPremiumCountdown(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const days = Math.floor(safeSeconds / 86400);
  const hours = Math.floor((safeSeconds % 86400) / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (days > 0) return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

export function formatPremiumDeadline(timestampSeconds, locale = 'vi-VN') {
  const normalizedTimestamp = normalizePremiumTimestamp(timestampSeconds);
  if (!normalizedTimestamp) {
    return 'No premium expiry scheduled';
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(normalizedTimestamp * 1000));
}

export function getPremiumWindowStatus(user, nowMs = Date.now()) {
  const premiumStartAt = normalizePremiumTimestamp(user?.premiumStartAt);
  const premiumEndAt = normalizePremiumTimestamp(user?.premiumEndAt);
  const nowSeconds = Math.floor(nowMs / 1000);
  const hasWindow = premiumStartAt > 0 && premiumEndAt > premiumStartAt;
  const isActive = hasWindow ? premiumStartAt <= nowSeconds && nowSeconds < premiumEndAt : isPremiumActiveForUser(user);
  const isUpcoming = hasWindow && nowSeconds < premiumStartAt;
  const totalSeconds = hasWindow ? premiumEndAt - premiumStartAt : 0;
  const remainingSeconds = isUpcoming ? premiumStartAt - nowSeconds : isActive && hasWindow ? premiumEndAt - nowSeconds : 0;
  const progressPercent = !hasWindow ? 0 : isUpcoming ? 100 : isActive && totalSeconds > 0 ? Math.max(0, Math.min(100, (remainingSeconds / totalSeconds) * 100)) : 0;

  return {
    expiryLabel: formatPremiumDeadline(premiumEndAt),
    hasWindow,
    isActive,
    isUpcoming,
    progressPercent,
    remainingLabel: formatPremiumCountdown(remainingSeconds),
  };
}