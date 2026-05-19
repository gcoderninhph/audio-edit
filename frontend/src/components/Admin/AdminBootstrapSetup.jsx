import { useState } from 'react';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import './AdminBootstrapSetup.css';

export default function AdminBootstrapSetup({ auth }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (username.trim().length < 3) {
      setLocalError('Username must be at least 3 characters.');
      return;
    }
    if (!password || password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    const nextSession = await auth.completeAdminSetup({
      username: username.trim(),
      password,
      displayName: displayName.trim(),
    });
    if (!nextSession) {
      return;
    }

    setLocalError('');
  };

  const errorMessage = localError || auth.error;

  return (
    <main className="admin-bootstrap-page dev-locator-host">
      <DeveloperLocator code="admin.bootstrap.page" title="Admin Bootstrap Setup" />
      <section className="admin-bootstrap-card dev-locator-host">
        <DeveloperLocator code="admin.bootstrap.form" title="Admin Bootstrap Form" />
        <p className="admin-bootstrap-kicker">Temporary admin login</p>
        <h1>Create your real admin account</h1>
        <p className="admin-bootstrap-copy">
          This backend is still using the temporary in-memory admin. Choose a permanent username and password now to create the real admin account.
        </p>

        <form className="admin-bootstrap-form" onSubmit={handleSubmit}>
          <label className="admin-bootstrap-field">
            <span>Admin username</span>
            <input
              type="text"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setLocalError('');
              }}
              placeholder="studio-admin"
              autoComplete="username"
              disabled={auth.isBusy}
            />
          </label>

          <label className="admin-bootstrap-field">
            <span>Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
                setLocalError('');
              }}
              placeholder="Studio Admin"
              autoComplete="name"
              disabled={auth.isBusy}
            />
          </label>

          <label className="admin-bootstrap-field">
            <span>New password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setLocalError('');
              }}
              placeholder="••••••••"
              autoComplete="new-password"
              disabled={auth.isBusy}
            />
          </label>

          <label className="admin-bootstrap-field">
            <span>Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setLocalError('');
              }}
              placeholder="••••••••"
              autoComplete="new-password"
              disabled={auth.isBusy}
            />
          </label>

          {errorMessage && <div className="admin-bootstrap-error">{errorMessage}</div>}

          <div className="admin-bootstrap-actions">
            <button type="button" className="btn btn-ghost" onClick={auth.logout} disabled={auth.isBusy}>Logout</button>
            <button type="submit" className="btn btn-primary" disabled={auth.isBusy}>
              {auth.isBusy ? 'Creating admin...' : 'Create real admin'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
