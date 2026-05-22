import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { fetchAdminOpenAiRequests } from '../api/adminOpenAiApi'
import { formatDateTime } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'
import Pagination from './Pagination'

const DEFAULT_PAGE_SIZE = 20
const STATUS_OPTIONS = ['', 'running', 'success', 'failed']

function StatusPill({ status }) {
  return <span className={`status-pill status-${status || 'running'}`}>{status || 'running'}</span>
}

export default function OpenAiRequestsPanel() {
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
      setError(loadError.message || 'Unable to load OpenAI requests.')
    } finally {
      setIsLoading(false)
    }
  }, [status])

  useEffect(() => {
    void loadRequests(1, status)
  }, [loadRequests, status])

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.service.openai.requests" title="Admin React OpenAI Requests" />
      <div className="section-toolbar">
        <div className="section-heading compact"><p>OpenAI</p><h2>Requests</h2></div>
        <div className="toolbar-actions">
          <select className="ghost-select" value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_OPTIONS.map((option) => <option key={option || 'all'} value={option}>{option || 'all'}</option>)}
          </select>
          <button type="button" className="ghost-button compact" onClick={() => void loadRequests(pagination?.page || 1, status)} disabled={isLoading}><RefreshCw size={17} /> Refresh</button>
        </div>
      </div>

      <div className="notice notice-info">Each row reflects the OpenAI-backed translation job stored by the backend. Prompt template, model, and token metadata come from the saved request snapshot.</div>
      {error && <div className="notice notice-error">{error}</div>}

      <div className="table-wrap">
        <table className="admin-table compact-table">
          <thead><tr><th>Request</th><th>User</th><th>Model</th><th>Status</th><th>Target</th><th>Updated</th></tr></thead>
          <tbody>
            {requests.map((record) => (
              <tr key={record.requestId}>
                <td>
                  <strong>{record.requestId}</strong>
                  <small>{record.sourceFileName || 'subtitles.srt'} {'->'} {record.outputFileName || '-'}</small>
                </td>
                <td>{record.userId || '-'}</td>
                <td>{record.details?.model || '-'}</td>
                <td><StatusPill status={record.status} /></td>
                <td>{record.targetLanguage || '-'}</td>
                <td>{formatDateTime(record.updatedAt || record.createdAt)}</td>
              </tr>
            ))}
            {!requests.length && <tr><td colSpan="6" className="empty-cell">{isLoading ? 'Loading OpenAI requests...' : 'No OpenAI requests yet.'}</td></tr>}
          </tbody>
        </table>
      </div>

      <Pagination itemLabel="requests" pagination={pagination} onPageChange={(nextPage) => void loadRequests(nextPage, status)} />
    </section>
  )
}