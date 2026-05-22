import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { fetchAdminOpenAiRequests } from '../api/adminOpenAiApi'
import { formatDateTime, formatNumber } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'
import Pagination from './Pagination'

const DEFAULT_PAGE_SIZE = 20
const STATUS_OPTIONS = ['', 'running', 'success', 'failed']

function getOpenAiRequestDetailPath(requestId) {
  return `/admin/service/openai/requests/${encodeURIComponent(requestId)}`
}

function formatTokenValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  return formatNumber(value)
}

export default function OpenAiTokenUsagePanel({ onNavigate }) {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [pagination, setPagination] = useState(null)
  const [requests, setRequests] = useState([])
  const [status, setStatus] = useState('')

  const loadRequests = useCallback(async (targetPage = 1, targetStatus = status) => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminOpenAiRequests({ page: targetPage, pageSize: DEFAULT_PAGE_SIZE, status: targetStatus })
      setRequests(payload.requests || [])
      setPagination(payload.pagination || null)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load OpenAI token usage.')
    } finally {
      setIsLoading(false)
    }
  }, [status])

  useEffect(() => {
    void loadRequests(1, status)
  }, [loadRequests, status])

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.service.openai.token-usage" title="Admin React OpenAI Token Usage" />
      <div className="section-toolbar">
        <div className="section-heading compact"><p>OpenAI</p><h2>Token usage</h2></div>
        <div className="toolbar-actions">
          <select className="ghost-select" value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_OPTIONS.map((option) => <option key={option || 'all'} value={option}>{option || 'all'}</option>)}
          </select>
          <button type="button" className="ghost-button compact" onClick={() => void loadRequests(pagination?.page || 1, status)} disabled={isLoading}><RefreshCw size={17} /> Refresh</button>
        </div>
      </div>

      <div className="notice notice-info">This table tracks the saved OpenAI token usage snapshot for each translation request, including input, output, and total tokens returned by the provider.</div>
      {error && <div className="notice notice-error">{error}</div>}

      <div className="table-wrap dev-host">
        <DeveloperMarker code="admin.react.service.openai.token-usage.table" title="Admin React OpenAI Token Usage Table" />
        <table className="admin-table compact-table">
          <thead><tr><th>Request</th><th>User</th><th>Model</th><th>Input</th><th>Output</th><th>Total</th><th>Updated</th></tr></thead>
          <tbody>
            {requests.map((record) => (
              <tr key={record.requestId} className="clickable-row" onClick={() => onNavigate?.(getOpenAiRequestDetailPath(record.requestId))}>
                <td>
                  <strong>{record.requestId}</strong>
                  <small>{record.sourceFileName || 'subtitles.srt'} {'->'} {record.outputFileName || '-'}</small>
                </td>
                <td>{record.userId || '-'}</td>
                <td>{record.details?.model || '-'}</td>
                <td>{formatTokenValue(record.details?.inputTokens)}</td>
                <td>{formatTokenValue(record.details?.outputTokens)}</td>
                <td>{formatTokenValue(record.details?.totalTokens)}</td>
                <td>{formatDateTime(record.updatedAt || record.createdAt)}</td>
              </tr>
            ))}
            {!requests.length && <tr><td colSpan="7" className="empty-cell">{isLoading ? 'Loading OpenAI token usage...' : 'No OpenAI token usage yet.'}</td></tr>}
          </tbody>
        </table>
      </div>

      <Pagination itemLabel="requests" pagination={pagination} onPageChange={(nextPage) => void loadRequests(nextPage, status)} />
    </section>
  )
}