import { useEffect, useMemo, useState } from 'react';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import { fetchAdminOverview, fetchAdminRequests, fetchAdminUsers, updateAdminUser } from '../../utils/adminClient';
import './AdminConsole.css';

function formatDateTime(timestamp) {
  if (!timestamp) return 'Unknown';
  try {
    return new Date(Number(timestamp) * 1000).toLocaleString();
  } catch {
    return 'Unknown';
  }
}

function formatRequestDateTime(timestamp) {
  if (!timestamp) return 'Unknown';
  try {
    return new Date(Number(timestamp) * 1000).toLocaleString();
  } catch {
    return 'Unknown';
  }
}

export default function AdminConsole() {
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [userDrafts, setUserDrafts] = useState({});
  const [savingUserId, setSavingUserId] = useState('');

  const reloadAdminData = async ({ keepLoading = false } = {}) => {
    if (keepLoading) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError('');

    try {
      const [overviewPayload, usersPayload, requestsPayload] = await Promise.all([
        fetchAdminOverview(),
        fetchAdminUsers(),
        fetchAdminRequests(),
      ]);
      const nextUsers = usersPayload.users || [];
      setOverview(overviewPayload);
      setUsers(nextUsers);
      setRequests(requestsPayload.requests || []);
      setUserDrafts(Object.fromEntries(nextUsers.map((user) => [user.id, {
        credits: String(user.credits ?? 0),
        role: user.role || 'user',
      }])));
    } catch (loadError) {
      setError(loadError.message || 'Unable to load admin data.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const loadInitialAdminData = async () => {
      try {
        const [overviewPayload, usersPayload, requestsPayload] = await Promise.all([
          fetchAdminOverview(),
          fetchAdminUsers(),
          fetchAdminRequests(),
        ]);
        if (isCancelled) {
          return;
        }

        const nextUsers = usersPayload.users || [];
        setOverview(overviewPayload);
        setUsers(nextUsers);
        setRequests(requestsPayload.requests || []);
        setUserDrafts(Object.fromEntries(nextUsers.map((user) => [user.id, {
          credits: String(user.credits ?? 0),
          role: user.role || 'user',
        }])));
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError.message || 'Unable to load admin data.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadInitialAdminData();
    return () => {
      isCancelled = true;
    };
  }, []);

  const pendingRequestCount = useMemo(
    () => requests.filter((request) => !['success', 'failed'].includes(String(request.status || '').toLowerCase())).length,
    [requests],
  );

  const handleDraftChange = (userId, field, value) => {
    setUserDrafts((currentDrafts) => ({
      ...currentDrafts,
      [userId]: {
        ...(currentDrafts[userId] || {}),
        [field]: value,
      },
    }));
  };

  const handleSaveUser = async (userId) => {
    const currentDraft = userDrafts[userId];
    if (!currentDraft) {
      return;
    }

    setSavingUserId(userId);
    setError('');
    try {
      const payload = await updateAdminUser(userId, {
        credits: Number(currentDraft.credits) || 0,
        role: currentDraft.role || 'user',
      });
      const updatedUser = payload.user;
      setUsers((currentUsers) => currentUsers.map((user) => (user.id === userId ? updatedUser : user)));
      setUserDrafts((currentDrafts) => ({
        ...currentDrafts,
        [userId]: {
          credits: String(updatedUser.credits ?? 0),
          role: updatedUser.role || 'user',
        },
      }));
      void reloadAdminData();
    } catch (saveError) {
      setError(saveError.message || 'Unable to save the selected user.');
    } finally {
      setSavingUserId('');
    }
  };

  if (isLoading) {
    return (
      <main className="admin-console-page dev-locator-host">
        <DeveloperLocator code="admin.console.loading" title="Admin Console Loading" />
        <div className="admin-console-empty">Loading admin console...</div>
      </main>
    );
  }

  return (
    <main className="admin-console-page dev-locator-host">
      <DeveloperLocator code="admin.console.page" title="Admin Console" />
      <section className="admin-console-hero dev-locator-host">
        <DeveloperLocator code="admin.console.hero" title="Admin Console Hero" />
        <div>
          <p className="admin-console-kicker">Backend admin</p>
          <h1>Admin Console</h1>
          <p className="admin-console-copy">
            Manage user roles and credits, then inspect recent backend requests from one place.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void reloadAdminData()} disabled={isRefreshing}>
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </section>

      {error && <div className="admin-console-error">{error}</div>}

      <section className="admin-console-summary dev-locator-host">
        <DeveloperLocator code="admin.console.summary" title="Admin Summary" />
        <article className="admin-summary-card">
          <span>Total users</span>
          <strong>{overview?.summary?.totalUsers ?? users.length}</strong>
        </article>
        <article className="admin-summary-card">
          <span>Admins</span>
          <strong>{overview?.summary?.adminUsers ?? users.filter((user) => user.role === 'admin').length}</strong>
        </article>
        <article className="admin-summary-card">
          <span>Total credits</span>
          <strong>{overview?.summary?.totalCredits ?? 0}</strong>
        </article>
        <article className="admin-summary-card">
          <span>Requests in progress</span>
          <strong>{pendingRequestCount}</strong>
        </article>
      </section>

      <section className="admin-console-section dev-locator-host">
        <DeveloperLocator code="admin.console.users" title="Admin Users Section" />
        <div className="admin-console-section-header">
          <div>
            <h2>Users</h2>
            <p>Promote or demote accounts and adjust their credit balance.</p>
          </div>
        </div>
        <div className="admin-user-table-wrapper">
          <table className="admin-user-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Login</th>
                <th>Role</th>
                <th>Credits</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const currentDraft = userDrafts[user.id] || { credits: String(user.credits ?? 0), role: user.role || 'user' };
                return (
                  <tr key={user.id}>
                    <td>
                      <div className="admin-user-primary">{user.displayName}</div>
                      <div className="admin-user-secondary">{user.id}</div>
                    </td>
                    <td>
                      <div className="admin-user-primary">{user.username || 'No username'}</div>
                      <div className="admin-user-secondary">{user.email}</div>
                    </td>
                    <td>
                      <select
                        value={currentDraft.role}
                        onChange={(event) => handleDraftChange(user.id, 'role', event.target.value)}
                        className="admin-user-select"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={currentDraft.credits}
                        onChange={(event) => handleDraftChange(user.id, 'credits', event.target.value)}
                        className="admin-user-input"
                      />
                    </td>
                    <td>{formatDateTime(user.createdAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => void handleSaveUser(user.id)}
                        disabled={savingUserId === user.id}
                      >
                        {savingUserId === user.id ? 'Saving...' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-console-section dev-locator-host">
        <DeveloperLocator code="admin.console.requests" title="Admin Requests Section" />
        <div className="admin-console-section-header">
          <div>
            <h2>Recent requests</h2>
            <p>Inspect the latest backend jobs and their current status.</p>
          </div>
        </div>
        <div className="admin-request-list">
          {requests.length === 0 ? (
            <div className="admin-console-empty">No recent requests found.</div>
          ) : (
            requests.map((requestRecord) => (
              <article key={requestRecord.requestId} className="admin-request-card dev-locator-host">
                <DeveloperLocator code={`admin.request.${requestRecord.requestId}`} title="Admin Request Card" />
                <div className="admin-request-topline">
                  <strong>{requestRecord.requestType || 'request'}</strong>
                  <span className={`admin-request-status status-${String(requestRecord.status || '').toLowerCase()}`}>
                    {requestRecord.status || 'unknown'}
                  </span>
                </div>
                <div className="admin-request-meta">Provider: {requestRecord.provider || 'n/a'} • User: {requestRecord.userId || 'n/a'}</div>
                <div className="admin-request-meta">Updated: {formatRequestDateTime(requestRecord.updatedAt)}</div>
                {requestRecord.sourceFileName && <div className="admin-request-meta">Source: {requestRecord.sourceFileName}</div>}
                {requestRecord.outputFileName && <div className="admin-request-meta">Output: {requestRecord.outputFileName}</div>}
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
