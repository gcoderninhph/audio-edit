import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { fetchAdminWhisperRequests } from '../api/adminWhisperApi'
import { formatDateTime } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'
import Pagination from './Pagination'

const DEFAULT_PAGE_SIZE = 20
const STATUS_OPTIONS = ['', 'running', 'success', 'failed']

function StatusPill({ status }) {
  return <span className={`status-pill status-${status || 'running'}`}>{status || 'running'}</span>
}

export default function WhisperRequestsPanel() {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [pagination, setPagination] = useState(null)
  const [requests, setRequests] = useState([])
  const [status, setStatus] = useState('')

  const loadRequests = useCallback(async (targetPage = 1, targetStatus = status) => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminWhisperRequests({ page: targetPage, pageSize: DEFAULT_PAGE_SIZE, status: targetStatus })
      setRequests(payload.requests || [])
      setPagination(payload.pagination || null)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load Whisper requests.')
    } finally {
      setIsLoading(false)
    }
  }, [status])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  return (
    <div className="dev-host">
      <DeveloperMarker code="admin.react.service.whisper.requests" title="Admin React Service Whisper Requests" />
      <div className="panel-toolbar">
        <div className="panel-toolbar-left">
          <select className="field" value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option || 'all'} value={option}>{option || 'All statuses'}</option>
            ))}
          </select>
        </div>
        <div className="panel-toolbar-right">
          <button type="button" className="ghost-btn" disabled={isLoading} onClick={() => loadRequests(pagination?.page || 1, status)}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      {isLoading && <div className="notice">Loading Whisper requests...</div>}

      {!isLoading && !error && requests.length === 0 && (
        <div className="empty-state">No Whisper requests found.</div>
      )}

      {!isLoading && requests.length > 0 && (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Status</th>
                <th>Created</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id || request.requestId}>
                  <td><code>{request.id || request.requestId || '—'}</code></td>
                  <td><StatusPill status={request.status} /></td>
                  <td>{formatDateTime(request.createdAt)}</td>
                  <td>{formatDateTime(request.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {pagination && (
            <Pagination pagination={pagination} onPageChange={(page) => loadRequests(page, status)} />
          )}
        </>
      )}
    </div>
  )
}
