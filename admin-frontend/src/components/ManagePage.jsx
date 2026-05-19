import { RefreshCw, Search, UserRound } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { fetchAdminUsers } from '../api/adminApi'
import { formatDateTime, formatNumber } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'
import Pagination from './Pagination'

export default function ManagePage({ onNavigate }) {
  const [summary, setSummary] = useState(null)
  const [users, setUsers] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  const loadUsers = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminUsers({ page, pageSize, search: submittedSearch })
      setSummary(payload.summary || {})
      setUsers(payload.users || [])
      setPagination(payload.pagination || null)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load users.')
    } finally {
      setIsLoading(false)
    }
  }, [page, pageSize, submittedSearch])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const submitSearch = (event) => {
    event.preventDefault()
    setPage(1)
    setSubmittedSearch(search.trim())
  }

  const cards = [
    ['Total users', summary?.totalUsers],
    ['Admins', summary?.adminUsers],
    ['Standard users', summary?.standardUsers],
    ['Total credits', summary?.totalCredits],
  ]

  return (
    <div className="page-stack dev-host">
      <DeveloperMarker code="admin.react.manage.page" title="Admin React Manage Page" />
      <section className="panel hero-panel dev-host">
        <DeveloperMarker code="admin.react.manage.summary" title="Admin React Manage Summary" />
        <div className="section-heading">
          <p>Backend Admin</p>
          <h1>User management</h1>
        </div>
        <button type="button" className="ghost-button" onClick={() => void loadUsers()} disabled={isLoading}>
          <RefreshCw size={17} /> Refresh
        </button>
      </section>

      {error && <div className="notice notice-error">{error}</div>}

      <section className="summary-grid dev-host">
        <DeveloperMarker code="admin.react.manage.cards" title="Admin React Manage Cards" />
        {cards.map(([label, value]) => (
          <article key={label} className="summary-card">
            <span>{label}</span>
            <strong>{formatNumber(value)}</strong>
          </article>
        ))}
      </section>

      <section className="panel dev-host">
        <DeveloperMarker code="admin.react.manage.users" title="Admin React Users Table" />
        <div className="section-toolbar">
          <h2>Users</h2>
          <label className="inline-control">
            <span>Page size</span>
            <select value={pageSize} onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)) }}>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </label>
        </div>
        <form className="search-bar" onSubmit={submitSearch}>
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or email" />
          <button type="submit" className="primary-button compact">Search</button>
        </form>
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>User</th><th>Role</th><th>Plan</th><th>Credits</th><th>Created</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="clickable-row" onClick={() => onNavigate(`/admin/users/${encodeURIComponent(user.id)}`)}>
                  <td><div className="user-cell"><UserRound size={18} /><span><strong>{user.displayName || user.username || user.email || user.id}</strong><small>{[user.username, user.email].filter(Boolean).join(' · ') || user.id}</small></span></div></td>
                  <td><span className="role-pill">{user.role || 'user'}</span></td>
                  <td><span className={user.isPremium ? 'premium-pill' : 'plan-pill'}>{user.isPremium ? 'Premium' : 'Standard'}</span></td>
                  <td>{formatNumber(user.credits)}</td>
                  <td>{formatDateTime(user.createdAt)}</td>
                </tr>
              ))}
              {!users.length && <tr><td colSpan="5" className="empty-cell">{isLoading ? 'Loading users...' : 'No users found.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination pagination={pagination} itemLabel="users" onPageChange={setPage} />
      </section>
    </div>
  )
}