import { useState } from 'react';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import './AuthDialog.css';

const DEMO_EMAIL = 'demo@local';
const DEMO_PASSWORD = 'demo123';
const AUTH_MODES = Object.freeze({
  LOGIN: 'login',
  REGISTER: 'register',
});

export default function AuthDialog({ auth, open, onClose }) {
  const [mode, setMode] = useState(AUTH_MODES.LOGIN);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  if (!open) return null;

  const isRegisterMode = mode === AUTH_MODES.REGISTER;

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    setLocalError('');
    auth.clearError?.();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setLocalError('Enter your email or username and password.');
      return;
    }

    if (isRegisterMode && password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    const credentials = {
      email: email.trim(),
      password,
      displayName: displayName.trim(),
    };
    const nextSession = isRegisterMode
      ? await auth.register(credentials)
      : await auth.login(credentials);
    if (nextSession) {
      onClose();
    }
  };

  const handleDemoLogin = async () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    const nextSession = await auth.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    if (nextSession) {
      onClose();
    }
  };

  const errorMessage = localError || auth.error;
  const title = isRegisterMode ? 'Create account' : 'Login';

  return (
    <div className="auth-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="auth-dialog dev-locator-host"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <DeveloperLocator code="auth.dialog" title="Auth Dialog" />
        <div className="auth-dialog-header">
          <div>
            <p className="auth-dialog-kicker">Optional account</p>
            <h2 id="auth-dialog-title">{title}</h2>
          </div>
          <button type="button" className="auth-dialog-close" onClick={onClose} aria-label="Close login dialog">×</button>
        </div>

        <div className="auth-mode-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={`auth-mode-tab ${!isRegisterMode ? 'active' : ''}`}
            onClick={() => handleModeChange(AUTH_MODES.LOGIN)}
            role="tab"
            aria-selected={!isRegisterMode}
          >
            Login
          </button>
          <button
            type="button"
            className={`auth-mode-tab ${isRegisterMode ? 'active' : ''}`}
            onClick={() => handleModeChange(AUTH_MODES.REGISTER)}
            role="tab"
            aria-selected={isRegisterMode}
          >
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegisterMode && (
            <label className="auth-field">
              <span>Name</span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setLocalError('');
                }}
                autoComplete="name"
                placeholder="Editor name"
                disabled={auth.isBusy}
              />
            </label>
          )}

          <label className="auth-field">
            <span>{isRegisterMode ? 'Email' : 'Email or username'}</span>
            <input
              type={isRegisterMode ? 'email' : 'text'}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setLocalError('');
              }}
              autoComplete="username"
              placeholder={isRegisterMode ? 'you@example.com' : 'you@example.com or admin-name'}
              disabled={auth.isBusy}
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setLocalError('');
              }}
              autoComplete="current-password"
              placeholder="••••••••"
              disabled={auth.isBusy}
            />
          </label>

          {isRegisterMode && (
            <label className="auth-field">
              <span>Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setLocalError('');
                }}
                autoComplete="new-password"
                placeholder="••••••••"
                disabled={auth.isBusy}
              />
            </label>
          )}

          {errorMessage && <div className="auth-error" role="alert">{errorMessage}</div>}

          <div className="auth-dialog-actions">
            {!isRegisterMode && (
              <button type="button" className="btn btn-ghost" onClick={handleDemoLogin} disabled={auth.isBusy}>
                Demo
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={auth.isBusy}>
              {auth.isBusy ? 'Please wait...' : title}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}