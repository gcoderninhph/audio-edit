import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import './AuthDialog.css';

export default function AuthHeaderActions({ auth, onOpenLogin }) {
  const userLabel = auth.user?.displayName || auth.user?.email || 'Signed in';

  return (
    <div className="auth-header-actions dev-locator-host">
      <DeveloperLocator code="header.auth" title="Header Auth Actions" />
      {auth.isAuthenticated ? (
        <>
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