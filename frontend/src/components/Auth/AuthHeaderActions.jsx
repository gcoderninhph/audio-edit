import { useEffect, useRef, useState } from 'react';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import { useI18n } from '../../i18n/useI18n';
import './AuthDialog.css';

export default function AuthHeaderActions({ auth, headerLocatorCode, onOpenAdminConsole, onOpenCreditsDialog, onOpenLogin }) {
  const { t } = useI18n();
  const menuRef = useRef(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userLabel = auth.user?.displayName || auth.user?.email || t('auth.signedIn');
  const creditBalance = Math.max(0, Number(auth.user?.credits) || 0);
  const canOpenAdminConsole = auth.isAdmin && !auth.requiresAdminSetup;
  const canOpenCreditsDialog = auth.isAuthenticated && typeof onOpenCreditsDialog === 'function';
  const isUserMenuVisible = auth.isAuthenticated && isUserMenuOpen;

  useEffect(() => {
    if (!isUserMenuVisible) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) {
        return;
      }
      setIsUserMenuOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isUserMenuVisible]);

  function handleLogout() {
    setIsUserMenuOpen(false);
    auth.logout();
  }

  return (
    <div className="auth-header-actions dev-locator-host">
      <DeveloperLocator code="header.auth" title="Header Auth Actions" />
      {auth.isAuthenticated ? (
        <>
          {canOpenAdminConsole && typeof onOpenAdminConsole === 'function' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenAdminConsole}>{t('auth.admin')}</button>
          )}
          <button
            type="button"
            className={`auth-credit-pill auth-credit-pill-button${canOpenCreditsDialog ? '' : ' auth-credit-pill-static'}`}
            title={canOpenCreditsDialog
              ? t('auth.creditsRemainingOpen', { credits: creditBalance })
              : t('auth.creditsRemaining', { credits: creditBalance })}
            onClick={canOpenCreditsDialog ? () => onOpenCreditsDialog(headerLocatorCode || 'header.dashboard') : undefined}
          >
            {t('auth.creditsLabel', { credits: creditBalance })}
          </button>
          <div className="auth-user-menu dev-locator-host" ref={menuRef}>
            <button
              type="button"
              className="auth-user-pill auth-user-menu-trigger"
              title={auth.user?.email || userLabel}
              onClick={() => setIsUserMenuOpen((current) => !current)}
              aria-expanded={isUserMenuVisible}
              aria-haspopup="menu"
            >
              <span className="auth-user-pill-label">{userLabel}</span>
              <span className={`auth-user-menu-caret${isUserMenuVisible ? ' auth-user-menu-caret-open' : ''}`}>▾</span>
            </button>
            {isUserMenuVisible && (
              <div className="auth-user-dropdown dev-locator-host" role="menu">
                <DeveloperLocator code={`${headerLocatorCode || 'header.dashboard'}.account-dropdown`} title="Header Account Dropdown" />
                <button type="button" className="auth-user-dropdown-item" role="menuitem" onClick={handleLogout}>
                  {t('auth.logout')}
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <button type="button" className="btn btn-primary btn-sm" onClick={onOpenLogin} disabled={auth.isBusy}>
          {t('auth.login')}
        </button>
      )}
    </div>
  );
}