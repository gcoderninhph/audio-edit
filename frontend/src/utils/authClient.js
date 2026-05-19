import { apiFetch } from './runtimeConfig';

const AUTH_STORAGE_KEY = 'audio-edit.auth-session.v1';
const TOKEN_REFRESH_WINDOW_MS = 60_000;
export const AUTH_SESSION_CHANGED_EVENT = 'audio-edit:auth-session-changed';

function normalizeAuthUser(user = {}) {
  const email = String(user.email || '');
  return {
    id: String(user.id || ''),
    credits: Math.max(0, Number(user.credits) || 0),
    email,
    isPremium: Boolean(user.isPremium),
    isTemporaryAdmin: Boolean(user.isTemporaryAdmin),
    mustSetupAdmin: Boolean(user.mustSetupAdmin),
    role: String(user.role || 'user'),
    displayName: String(user.displayName || email.split('@')[0] || 'Editor'),
    username: String(user.username || ''),
  };
}

function emitAuthSessionChanged(session) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_CHANGED_EVENT, { detail: session }));
}

function decodeJwtPayload(token) {
  try {
    const payloadSegment = String(token || '').split('.')[1];
    if (!payloadSegment) return null;

    const paddedSegment = payloadSegment.replace(/-/g, '+').replace(/_/g, '/').padEnd(
      Math.ceil(payloadSegment.length / 4) * 4,
      '=',
    );
    return JSON.parse(globalThis.atob(paddedSegment));
  } catch {
    return null;
  }
}

function getTokenExpiresAt(token) {
  const expiresAtSeconds = Number(decodeJwtPayload(token)?.exp) || 0;
  return expiresAtSeconds > 0 ? expiresAtSeconds * 1000 : 0;
}

function normalizeTimestamp(value) {
  const timestamp = Number(value) || 0;
  return timestamp > 100000000000 ? timestamp : timestamp * 1000;
}

function normalizeAuthResponse(payload = {}) {
  const accessToken = String(payload.accessToken || '');
  const refreshToken = String(payload.refreshToken || '');
  const accessTokenExpiresAt = getTokenExpiresAt(accessToken) || normalizeTimestamp(payload.accessTokenExpiresAt);
  const refreshTokenExpiresAt = getTokenExpiresAt(refreshToken) || normalizeTimestamp(payload.refreshTokenExpiresAt);
  const user = normalizeAuthUser(payload.user);

  if (!accessToken || !refreshToken || !user.id || !user.email) {
    throw new Error('Auth response is missing token data.');
  }

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    user,
  };
}

async function parseAuthResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Authentication request failed.');
  }
  return payload;
}

export function getStoredAuthSession() {
  if (typeof localStorage === 'undefined') return null;

  try {
    const session = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null');
    if (!session?.accessToken || !session?.refreshToken || !session?.user) return null;
    return {
      ...session,
      user: normalizeAuthUser(session.user),
    };
  } catch {
    return null;
  }
}

export function saveAuthSession(session) {
  if (typeof localStorage === 'undefined') return;
  const normalizedSession = {
    ...session,
    user: normalizeAuthUser(session?.user),
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(normalizedSession));
  emitAuthSessionChanged(normalizedSession);
}

export function clearAuthSession() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  emitAuthSessionChanged(null);
}

export function updateStoredAuthCredits(credits) {
  const storedSession = getStoredAuthSession();
  if (!storedSession?.user) {
    return null;
  }

  const nextSession = {
    ...storedSession,
    user: {
      ...storedSession.user,
      credits: Math.max(0, Number(credits) || 0),
    },
  };
  saveAuthSession(nextSession);
  return nextSession;
}

export function isAccessTokenExpiring(session, windowMs = TOKEN_REFRESH_WINDOW_MS) {
  return !session?.accessTokenExpiresAt || session.accessTokenExpiresAt - Date.now() <= windowMs;
}

export function isRefreshTokenExpired(session) {
  return Boolean(session?.refreshTokenExpiresAt && session.refreshTokenExpiresAt <= Date.now());
}

export function getAuthRequestHeaders() {
  const session = getStoredAuthSession();
  return session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
}

export async function loginWithPassword({ email, password }) {
  const payload = await parseAuthResponse(await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }));
  return normalizeAuthResponse(payload);
}

export async function registerWithPassword({ email, password, displayName }) {
  const payload = await parseAuthResponse(await apiFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName }),
  }));
  return normalizeAuthResponse(payload);
}

export async function refreshAuthSession(refreshToken) {
  const payload = await parseAuthResponse(await apiFetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }));
  return normalizeAuthResponse(payload);
}

export async function fetchCurrentUser(accessToken) {
  return parseAuthResponse(await apiFetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  }));
}

export async function logoutAuthSession(refreshToken) {
  await apiFetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => null);
}