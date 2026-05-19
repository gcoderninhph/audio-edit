import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import AuthHeaderActions from '../Auth/AuthHeaderActions';
import { isPremiumActiveForUser } from '../../utils/authClient';

function CrownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 18h14l-1.3-8.5-4.39 3.16L12 6 10.69 12.66 6.3 9.5 5 18Zm2.58-2 0.57-3.7 2.43 1.75L12 10.42l1.42 3.63 2.43-1.75 0.57 3.7H7.58Zm-0.08 2h9v2h-9v-2Z" />
    </svg>
  );
}

export default function AppHeader({
  auth,
  children,
  locatorCode,
  locatorTitle,
  onOpenAdminConsole,
  onOpenAuthDialog,
  showPremiumButton = false,
  showClientBadge = false,
  title = 'VideoForge',
}) {
  const isPremium = isPremiumActiveForUser(auth.user);
  const canPromptPremiumLogin = !auth.isAuthenticated && typeof onOpenAuthDialog === 'function';
  const premiumTitle = isPremium
    ? 'Premium active: preview and export do not show the G Studio watermark.'
    : canPromptPremiumLogin
      ? 'Log in to view premium account status.'
      : 'Premium is enabled per account by an admin.';

  return (
    <header className="app-header dev-locator-host">
      <DeveloperLocator code={locatorCode} title={locatorTitle} />
      <div className="app-logo">
        <div className="app-logo-icon">🎬</div>
        <span className="app-logo-text gradient-text">{title}</span>
        {showClientBadge && <span className="app-logo-badge">CLIENT-SIDE</span>}
      </div>
      <div className="header-status">
        {children}
        {showPremiumButton && (
          <button
            type="button"
            className={`premium-header-button${isPremium ? ' premium-header-button-active' : ''}${canPromptPremiumLogin ? '' : ' premium-header-button-static'}`}
            onClick={canPromptPremiumLogin ? onOpenAuthDialog : undefined}
            title={premiumTitle}
            aria-label={premiumTitle}
            aria-pressed={isPremium}
          >
            <span className="premium-header-button-icon">
              <CrownIcon />
            </span>
            <span className="premium-header-button-text">Premium</span>
          </button>
        )}
        <AuthHeaderActions
          auth={auth}
          onOpenAdminConsole={onOpenAdminConsole}
          onOpenLogin={onOpenAuthDialog}
        />
      </div>
    </header>
  );
}
