import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import AuthHeaderActions from '../Auth/AuthHeaderActions';
import { isPremiumActiveForUser } from '../../utils/authClient';
import HeaderLanguageSwitcher from './HeaderLanguageSwitcher';
import { useI18n } from '../../i18n/useI18n';

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
  onOpenCreditDialog,
  onOpenPremiumDialog,
  showPremiumButton = false,
  showClientBadge = false,
  title = 'VideoForge',
}) {
  const { t } = useI18n();
  const isPremium = isPremiumActiveForUser(auth.user);
  const shouldShowPremiumButton = showPremiumButton && auth.isAuthenticated;
  const canOpenPremiumDialog = typeof onOpenPremiumDialog === 'function';
  const premiumTitle = isPremium
    ? t('header.premiumTitleActive')
    : canOpenPremiumDialog
      ? t('header.premiumTitleOpen')
      : t('header.premiumTitleStatic');

  return (
    <header className="app-header dev-locator-host">
      <DeveloperLocator code={locatorCode} title={locatorTitle} />
      <div className="app-logo">
        <div className="app-logo-icon">🎬</div>
        <span className="app-logo-text gradient-text">{title}</span>
        {showClientBadge && <span className="app-logo-badge">{t('header.clientBadge')}</span>}
      </div>
      <div className="header-status">
        {children}
        <HeaderLanguageSwitcher locatorCode={locatorCode} />
        {shouldShowPremiumButton && (
          <button
            type="button"
            className={`premium-header-button${isPremium ? ' premium-header-button-active' : ''}${canOpenPremiumDialog ? '' : ' premium-header-button-static'}`}
            onClick={canOpenPremiumDialog ? () => onOpenPremiumDialog(locatorCode) : undefined}
            title={premiumTitle}
            aria-label={premiumTitle}
            aria-pressed={isPremium}
          >
            <span className="premium-header-button-icon">
              <CrownIcon />
            </span>
            <span className="premium-header-button-text">{t('header.premium')}</span>
          </button>
        )}
        <AuthHeaderActions
          auth={auth}
          headerLocatorCode={locatorCode}
          onOpenAdminConsole={onOpenAdminConsole}
          onOpenCreditsDialog={onOpenCreditDialog}
          onOpenLogin={onOpenAuthDialog}
        />
      </div>
    </header>
  );
}
