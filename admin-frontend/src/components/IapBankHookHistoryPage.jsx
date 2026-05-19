import { ArrowLeft, RefreshCw, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAdminIapBankHookHistory } from '../api/adminApi'
import { formatDateTime, formatNumber } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'
import Pagination from './Pagination'

const PAGE_SIZE = 20

function getBankTimeLabel(record) {
  if (record?.transactionAt) return formatDateTime(record.transactionAt)
  return record?.transactionDate || '-'
}

function getAccountLabel(record) {
  const values = [record?.accountNumber, record?.subAccount].filter(Boolean)
  return values.join(' · ') || '-'
}

export default function IapBankHookHistoryPage({ onHeaderActionsChange, onNavigate }) {
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState(null)
  const [draftEndDate, setDraftEndDate] = useState('')
  const [draftSearch, setDraftSearch] = useState('')
  const [draftStartDate, setDraftStartDate] = useState('')
  const [filters, setFilters] = useState({ endDate: '', search: '', startDate: '' })

  const loadHistory = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminIapBankHookHistory({
        endDate: filters.endDate,
        page,
        pageSize: PAGE_SIZE,
        search: filters.search,
        startDate: filters.startDate,
      })
      setHistory(payload.history || [])
      setPagination(payload.pagination || null)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load bank hook history.')
    } finally {
      setIsLoading(false)
    }
  }, [filters.endDate, filters.search, filters.startDate, page])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const headerActions = useMemo(() => ([
    <button key="back" type="button" className="ghost-button compact" onClick={() => onNavigate('/admin/iap')}>
      <ArrowLeft size={17} /> Back
    </button>,
    <button key="refresh" type="button" className="ghost-button compact" onClick={() => void loadHistory()} disabled={isLoading}>
      <RefreshCw size={17} /> Refresh
    </button>,
  ]), [isLoading, loadHistory, onNavigate])

  useEffect(() => {
    onHeaderActionsChange?.(headerActions)
    return () => onHeaderActionsChange?.(null)
  }, [headerActions, onHeaderActionsChange])

  const handleFilterSubmit = (event) => {
    event.preventDefault()
    setPage(1)
    setFilters({
      endDate: draftEndDate,
      search: draftSearch.trim(),
      startDate: draftStartDate,
    })
  }

  const handleFilterReset = () => {
    setDraftEndDate('')
    setDraftSearch('')
    setDraftStartDate('')
    setPage(1)
    setFilters({ endDate: '', search: '', startDate: '' })
  }

  return (
    <div className="page-stack dev-host">
      <DeveloperMarker code="admin.react.manage.iap.bank-hook-history" title="Admin React IAP Bank Hook History" />
      <section className="panel dev-host">
        <DeveloperMarker code="admin.react.manage.iap.bank-hook-history.table" title="Admin React IAP Bank Hook History Table" />
        <div className="section-heading compact">
          <p>Bank hook</p>
          <h2>History</h2>
        </div>

        <form className="iap-history-filter-grid dev-host" onSubmit={handleFilterSubmit}>
          <DeveloperMarker code="admin.react.manage.iap.bank-hook-history.filters" title="Admin React IAP Bank Hook History Filters" />
          <label className="field field-wide">
            <span>Search transaction</span>
            <input
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="Search content, code, reference code, account number"
            />
          </label>
          <label className="field">
            <span>From date</span>
            <input type="date" value={draftStartDate} onChange={(event) => setDraftStartDate(event.target.value)} />
          </label>
          <label className="field">
            <span>To date</span>
            <input type="date" value={draftEndDate} onChange={(event) => setDraftEndDate(event.target.value)} />
          </label>
          <div className="iap-history-filter-actions">
            <button type="submit" className="primary-button compact" disabled={isLoading}>
              <Search size={17} /> Search
            </button>
            <button type="button" className="ghost-button compact" onClick={handleFilterReset} disabled={isLoading}>
              <X size={17} /> Reset
            </button>
          </div>
        </form>

        {error && <div className="notice notice-error">{error}</div>}

        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Received</th>
                <th>API key</th>
                <th>Bank</th>
                <th>Amount</th>
                <th>Transfer content</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {history.map((record) => (
                <tr key={record.id} className="clickable-row" onClick={() => onNavigate(`/admin/iap/bank-hook-history/${record.id}`)}>
                  <td>
                    <strong>{formatDateTime(record.receivedAt)}</strong>
                    <small>Bank time: {getBankTimeLabel(record)}</small>
                  </td>
                  <td>
                    <strong>{record.apiKeyName || '-'}</strong>
                    <small>#{record.apiKeyId || '-'}</small>
                  </td>
                  <td>
                    <strong>{record.gateway || '-'}</strong>
                    <small>{getAccountLabel(record)}</small>
                  </td>
                  <td>
                    <strong>{formatNumber(record.transferAmount)}</strong>
                    <small>{record.transferType || '-'} · Accumulated {formatNumber(record.accumulated)}</small>
                  </td>
                  <td>
                    <strong>{record.content || '-'}</strong>
                    <small>{record.description || '-'}</small>
                  </td>
                  <td>
                    <strong>{record.referenceCode || '-'}</strong>
                    <small>{record.code || '-'}</small>
                  </td>
                </tr>
              ))}
              {!history.length && <tr><td colSpan="6" className="empty-cell">{isLoading ? 'Loading bank hook history...' : 'No bank hook transactions matched the current filters.'}</td></tr>}
            </tbody>
          </table>
        </div>

        <Pagination pagination={pagination} itemLabel="transactions" onPageChange={setPage} />
      </section>
    </div>
  )
}