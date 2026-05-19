import { ArrowLeft, Coins, Plus, RefreshCw, Star } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { addUserCredits, fetchAdminUser, fetchCreditHistory, fetchUserRequests, updateAdminUser } from '../api/adminApi'
import { formatDateTime, formatNumber, getRequestSource } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'
import Pagination from './Pagination'

const PAGE_SIZE = 10

export default function UserDetailPage({ userId, onNavigate, onHeaderActionsChange }) {
  const [user, setUser] = useState(null)
  const [requests, setRequests] = useState([])
  const [history, setHistory] = useState([])
  const [requestPage, setRequestPage] = useState(1)
  const [historyPage, setHistoryPage] = useState(1)
  const [requestPagination, setRequestPagination] = useState(null)
  const [historyPagination, setHistoryPagination] = useState(null)
  const [creditAmount, setCreditAmount] = useState('')
  const [creditNote, setCreditNote] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingCredits, setIsSavingCredits] = useState(false)
  const [isSavingPremium, setIsSavingPremium] = useState(false)

  const loadDetail = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [userPayload, requestPayload, historyPayload] = await Promise.all([
        fetchAdminUser(userId),
        fetchUserRequests(userId, { page: requestPage, pageSize: PAGE_SIZE }),
        fetchCreditHistory(userId, { page: historyPage, pageSize: PAGE_SIZE }),
      ])
      setUser(userPayload.user || null)
      setRequests(requestPayload.requests || [])
      setHistory(historyPayload.history || [])
      setRequestPagination(requestPayload.pagination || null)
      setHistoryPagination(historyPayload.pagination || null)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load user detail.')
    } finally {
      setIsLoading(false)
    }
  }, [historyPage, requestPage, userId])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const headerActions = useMemo(() => ([
    <button key="back" type="button" className="ghost-button compact" onClick={() => onNavigate('/admin/manage')}>
      <ArrowLeft size={17} /> Back
    </button>,
    <button
      key="refresh"
      type="button"
      className="ghost-button compact"
      onClick={() => void loadDetail()}
      disabled={isLoading || isSavingCredits || isSavingPremium}
    >
      <RefreshCw size={17} /> Refresh
    </button>,
  ]), [isLoading, isSavingCredits, isSavingPremium, loadDetail, onNavigate])

  useEffect(() => {
    onHeaderActionsChange?.(headerActions)
    return () => onHeaderActionsChange?.(null)
  }, [headerActions, onHeaderActionsChange])

  const handleAddCredits = async (event) => {
    event.preventDefault()
    const amount = Number(creditAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a credit amount greater than 0.')
      return
    }
    setIsSavingCredits(true)
    setError('')
    try {
      await addUserCredits(userId, amount, creditNote.trim())
      setCreditAmount('')
      setCreditNote('')
      setIsDialogOpen(false)
      setHistoryPage(1)
      await loadDetail()
    } catch (saveError) {
      setError(saveError.message || 'Unable to add credits.')
    } finally {
      setIsSavingCredits(false)
    }
  }

  const handlePremiumToggle = async () => {
    if (!user) return

    setIsSavingPremium(true)
    setError('')
    try {
      const payload = await updateAdminUser(userId, { isPremium: !user.isPremium })
      setUser(payload.user || null)
    } catch (saveError) {
      setError(saveError.message || 'Unable to update premium access.')
    } finally {
      setIsSavingPremium(false)
    }
  }

  return (
    <div className="page-stack dev-host">
      <DeveloperMarker code="admin.react.detail.page" title="Admin React Detail Page" />
      <section className="section-toolbar detail-page-toolbar dev-host">
        <DeveloperMarker code="admin.react.detail.summary" title="Admin React Detail Summary" />
        <div className="section-heading">
          <p>User detail</p>
          <h1>{user?.displayName || user?.username || user?.email || userId}</h1>
          <span>{[user?.username, user?.email, user?.id].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="detail-page-actions">
          <div className="detail-user-tags">
            <span className="role-pill">{user?.role || 'user'}</span>
            <span className={user?.isPremium ? 'premium-pill' : 'plan-pill'}>{user?.isPremium ? 'Premium' : 'Standard'}</span>
            <span className="plan-pill">Credits {formatNumber(user?.credits)}</span>
          </div>
          <div className="toolbar-actions">
          <button
            type="button"
            className={`${user?.isPremium ? 'ghost-button' : 'primary-button'} compact`}
            onClick={() => void handlePremiumToggle()}
            disabled={isLoading || isSavingPremium || !user}
          >
            <Star size={17} />
            {isSavingPremium ? 'Saving...' : user?.isPremium ? 'Disable premium' : 'Enable premium'}
          </button>
          <button type="button" className="primary-button compact" onClick={() => setIsDialogOpen(true)}><Coins size={17} /> Add credits</button>
          </div>
        </div>
      </section>

      {error && <div className="notice notice-error">{error}</div>}
      {isLoading && <div className="notice notice-info">Loading user detail...</div>}

      <section className="detail-grid">
        <article className="panel dev-host">
          <DeveloperMarker code="admin.react.detail.requests" title="Admin React Detail Requests" />
          <div className="section-toolbar"><h2>User requests</h2></div>
          <div className="table-wrap">
            <table className="admin-table compact-table">
              <thead><tr><th>Type</th><th>Status</th><th>Source</th><th>Updated</th></tr></thead>
              <tbody>
                {requests.map((record) => (
                  <tr key={record.requestId}>
                    <td><strong>{record.requestType || '-'}</strong><small>{record.requestId || '-'}</small></td>
                    <td><span className={`status-pill status-${String(record.status || '').toLowerCase()}`}>{record.status || 'unknown'}</span></td>
                    <td>{getRequestSource(record)}</td>
                    <td>{formatDateTime(record.updatedAt)}</td>
                  </tr>
                ))}
                {!requests.length && <tr><td colSpan="4" className="empty-cell">No requests found.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination pagination={requestPagination} itemLabel="items" onPageChange={setRequestPage} />
        </article>

        <article className="panel dev-host">
          <DeveloperMarker code="admin.react.detail.credits" title="Admin React Detail Credits" />
          <div className="section-toolbar"><h2>Credit history</h2></div>
          <div className="table-wrap">
            <table className="admin-table compact-table">
              <thead><tr><th>Change</th><th>Type</th><th>Balance</th><th>Time</th></tr></thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id}>
                    <td><strong className={Number(entry.deltaCredits) > 0 ? 'positive-text' : 'negative-text'}>{Number(entry.deltaCredits) > 0 ? '+' : ''}{formatNumber(entry.deltaCredits)}</strong><small>{entry.note}</small></td>
                    <td>{entry.changeType || 'adjustment'}</td>
                    <td>{formatNumber(entry.balanceAfter)}</td>
                    <td>{formatDateTime(entry.createdAt)}</td>
                  </tr>
                ))}
                {!history.length && <tr><td colSpan="4" className="empty-cell">No credit history.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination pagination={historyPagination} itemLabel="items" onPageChange={setHistoryPage} />
        </article>
      </section>

      {isDialogOpen && (
        <div className="dialog-backdrop" role="presentation">
          <form className="credit-dialog dev-host" onSubmit={handleAddCredits}>
            <DeveloperMarker code="admin.react.detail.add-credits" title="Admin React Add Credits" />
            <div className="section-heading compact"><p>Credit grant</p><h2>Add credits</h2></div>
            <label className="field"><span>Credits</span><input type="number" min="1" value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} required /></label>
            <label className="field"><span>Note</span><input value={creditNote} onChange={(event) => setCreditNote(event.target.value)} maxLength={255} /></label>
            <div className="dialog-actions">
              <button type="button" className="ghost-button" onClick={() => setIsDialogOpen(false)}>Cancel</button>
              <button type="submit" className="primary-button compact" disabled={isSavingCredits}><Plus size={17} /> Confirm</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}