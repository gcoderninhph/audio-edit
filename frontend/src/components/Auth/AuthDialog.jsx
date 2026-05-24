import { useState } from 'react';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import { useI18n } from '../../i18n/useI18n';
import './AuthDialog.css';

const DEMO_EMAIL = 'demo@local';
const DEMO_PASSWORD = 'demo123';
const AUTH_MODES = Object.freeze({
  LOGIN: 'login',
  REGISTER: 'register',
});

export default function AuthDialog({ auth, open, onClose }) {
  const { t } = useI18n();
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
      setLocalError(t('auth.dialog.enterCredentials'));
      return;
    }

    if (isRegisterMode && password !== confirmPassword) {
      setLocalError(t('auth.dialog.passwordsDoNotMatch'));
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
  const title = isRegisterMode ? t('auth.dialog.createAccount') : t('auth.login');

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
            <p className="auth-dialog-kicker">{t('auth.dialog.optionalAccount')}</p>
            <h2 id="auth-dialog-title">{title}</h2>
          </div>
          <button type="button" className="auth-dialog-close" onClick={onClose} aria-label={t('auth.dialog.closeLoginDialog')}>×</button>
        </div>

        <div className="auth-mode-tabs" role="tablist" aria-label={t('auth.dialog.authenticationMode')}>
          <button
            type="button"
            className={`auth-mode-tab ${!isRegisterMode ? 'active' : ''}`}
            onClick={() => handleModeChange(AUTH_MODES.LOGIN)}
            role="tab"
            aria-selected={!isRegisterMode}
          >
            {t('auth.login')}
          </button>
          <button
            type="button"
            className={`auth-mode-tab ${isRegisterMode ? 'active' : ''}`}
            onClick={() => handleModeChange(AUTH_MODES.REGISTER)}
            role="tab"
            aria-selected={isRegisterMode}
          >
            {t('auth.dialog.createAccount')}
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegisterMode && (
            <label className="auth-field">
              <span>{t('auth.dialog.name')}</span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setLocalError('');
                }}
                autoComplete="name"
                placeholder={t('auth.dialog.editorName')}
                disabled={auth.isBusy}
              />
            </label>
          )}

          <label className="auth-field">
            <span>{isRegisterMode ? t('auth.dialog.email') : t('auth.dialog.emailOrUsername')}</span>
            <input
              type={isRegisterMode ? 'email' : 'text'}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setLocalError('');
              }}
              autoComplete="username"
              placeholder={isRegisterMode ? t('auth.dialog.emailPlaceholder') : t('auth.dialog.emailOrUsernamePlaceholder')}
              disabled={auth.isBusy}
            />
          </label>

          <label className="auth-field">
            <span>{t('auth.dialog.password')}</span>
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
              <span>{t('auth.dialog.confirmPassword')}</span>
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
                {t('auth.dialog.demo')}
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={auth.isBusy}>
              {auth.isBusy ? t('auth.dialog.pleaseWait') : title}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}