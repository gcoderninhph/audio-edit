import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import './AuthDialog.css';

export default function AuthHeaderActions({ auth, onOpenAdminConsole, onOpenLogin }) {
  const userLabel = auth.user?.displayName || auth.user?.email || 'Signed in';
  const creditBalance = Math.max(0, Number(auth.user?.credits) || 0);
  const canOpenAdminConsole = auth.isAdmin && !auth.requiresAdminSetup;

  return (
    <div className="auth-header-actions dev-locator-host">
      <DeveloperLocator code="header.auth" title="Header Auth Actions" />
      {auth.isAuthenticated ? (
        <>
          {canOpenAdminConsole && typeof onOpenAdminConsole === 'function' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenAdminConsole}>Admin</button>
          )}
          <span className="auth-credit-pill" title={`${creditBalance} credits remaining`}>{creditBalance} credits</span>
          <span className="auth-user-pill" title={auth.user?.email || userLabel}>{userLabel}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={auth.logout}>Logout</button>
        </>
      ) : (
        <button type="button" className="btn btn-primary btn-sm" onClick={onOpenLogin} disabled={auth.isBusy}>
          Login
        </button>
      )}
    </div>
  );
}