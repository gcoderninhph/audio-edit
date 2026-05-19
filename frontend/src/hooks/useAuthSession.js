import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { completeTemporaryAdminSetup } from '../utils/adminClient';
import {
  AUTH_SESSION_CHANGED_EVENT,
  clearAuthSession,
  getStoredAuthSession,
  isRefreshTokenExpired,
  loginWithPassword,
  logoutAuthSession,
  registerWithPassword,
  refreshAuthSession,
  saveAuthSession,
} from '../utils/authClient';

const REFRESH_WINDOW_MS = 60_000;

function getInitialAuthSession() {
  const storedSession = getStoredAuthSession();
  if (storedSession && isRefreshTokenExpired(storedSession)) {
    clearAuthSession();
    return null;
  }
  return storedSession;
}

export function useAuthSession() {
  const [session, setSession] = useState(getInitialAuthSession);
  const [status, setStatus] = useState(() => (getStoredAuthSession() ? 'authenticated' : 'anonymous'));
  const [error, setError] = useState('');
  const refreshInFlightRef = useRef(null);

  const persistSession = useCallback((nextSession) => {
    saveAuthSession(nextSession);
    setSession(nextSession);
    setStatus('authenticated');
  }, []);

  const clearSession = useCallback(() => {
    clearAuthSession();
    setSession(null);
    setStatus('anonymous');
  }, []);

  const clearError = useCallback(() => {
    setError('');
  }, []);

  const refreshSession = useCallback(async (refreshToken = session?.refreshToken) => {
    if (!refreshToken) {
      clearSession();
      return null;
    }

    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    setStatus('refreshing');
    setError('');

    refreshInFlightRef.current = refreshAuthSession(refreshToken)
      .then((nextSession) => {
        persistSession(nextSession);
        return nextSession;
      })
      .catch((refreshError) => {
        clearSession();
        setError(refreshError.message || 'Could not refresh your login session.');
        return null;
      })
      .finally(() => {
        refreshInFlightRef.current = null;
      });

    return refreshInFlightRef.current;
  }, [clearSession, persistSession, session?.refreshToken]);

  const login = useCallback(async ({ email, password }) => {
    setStatus('authenticating');
    setError('');
    try {
      const nextSession = await loginWithPassword({ email, password });
      persistSession(nextSession);
      return nextSession;
    } catch (loginError) {
      clearSession();
      setError(loginError.message || 'Login failed.');
      return null;
    }
  }, [clearSession, persistSession]);

  const register = useCallback(async ({ email, password, displayName }) => {
    setStatus('authenticating');
    setError('');
    try {
      const nextSession = await registerWithPassword({ email, password, displayName });
      persistSession(nextSession);
      return nextSession;
    } catch (registerError) {
      clearSession();
      setError(registerError.message || 'Registration failed.');
      return null;
    }
  }, [clearSession, persistSession]);

  const completeAdminSetup = useCallback(async ({ username, password, displayName }) => {
    setStatus('authenticating');
    setError('');
    try {
      const nextSession = await completeTemporaryAdminSetup({ username, password, displayName });
      persistSession(nextSession);
      return nextSession;
    } catch (setupError) {
      setError(setupError.message || 'Admin setup failed.');
      return null;
    }
  }, [persistSession]);

  const logout = useCallback(async () => {
    const refreshToken = session?.refreshToken;
    clearSession();
    setError('');
    if (refreshToken) {
      await logoutAuthSession(refreshToken);
    }
  }, [clearSession, session?.refreshToken]);

  useEffect(() => {
    if (!session?.refreshToken) return undefined;
    if (isRefreshTokenExpired(session)) return undefined;

    const refreshDelay = Math.max(0, session.accessTokenExpiresAt - Date.now() - REFRESH_WINDOW_MS);
    const refreshTimer = window.setTimeout(() => {
      void refreshSession(session.refreshToken);
    }, refreshDelay);

    return () => window.clearTimeout(refreshTimer);
  }, [clearSession, refreshSession, session]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleSessionChanged = (event) => {
      const nextSession = event.detail || null;
      setSession(nextSession);
      setStatus(nextSession ? 'authenticated' : 'anonymous');
    };

    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, handleSessionChanged);
    return () => window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, handleSessionChanged);
  }, []);

  const value = useMemo(() => ({
    accessToken: session?.accessToken || '',
    credits: session?.user?.credits ?? 0,
    error,
    isAdmin: session?.user?.role === 'admin',
    isAuthenticated: Boolean(session?.accessToken && session?.user),
    isBusy: status === 'authenticating' || status === 'refreshing',
    isTemporaryAdmin: Boolean(session?.user?.isTemporaryAdmin),
    login,
    logout,
    completeAdminSetup,
    requiresAdminSetup: Boolean(session?.user?.mustSetupAdmin),
    register,
    refreshSession,
    status,
    user: session?.user || null,
    clearError,
  }), [clearError, completeAdminSetup, error, login, logout, register, refreshSession, session, status]);

  return value;
}