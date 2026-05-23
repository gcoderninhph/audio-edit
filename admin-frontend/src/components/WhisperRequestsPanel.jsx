import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { fetchAdminWhisperRequests } from '../api/adminWhisperApi'
import { formatDateTime } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'
import Pagination from './Pagination'

const DEFAULT_PAGE_SIZE = 20
const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'processing', label: 'Processing' },
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
]

function StatusPill({ status }) {
  return <span className={`status-pill status-${status || 'processing'}`}>{status || 'processing'}</span>
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
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.service.whisper.requests" title="Admin React Service Whisper Requests" />
      <div className="section-toolbar">
        <div className="section-heading compact">
          <p>Whisper</p>
          <h2>Request list</h2>
        </div>
        <div className="toolbar-actions">
          <div className="button-group" role="group" aria-label="Whisper request filters">
            <select className="ghost-select compact" value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button type="button" className="ghost-button compact" disabled={isLoading} onClick={() => void loadRequests(pagination?.page || 1, status)}>
              <RefreshCw size={17} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      <div className="table-wrap">
        <table className="admin-table compact-table">
          <thead>
            <tr>
              <th>Request</th>
              <th>Node</th>
              <th>Status</th>
              <th>Queue</th>
              <th>Created</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((requestRecord) => (
              <tr key={requestRecord.id || requestRecord.requestId}>
                <td>
                  <strong className="table-truncate">{requestRecord.requestId || requestRecord.id || '—'}</strong>
                  <small>{requestRecord.sourceFileName || 'Temporary Whisper upload'}</small>
                </td>
                <td>
                  <strong className="table-truncate">{requestRecord.nodeBaseUrl || 'Waiting for node assignment'}</strong>
                  <small>{requestRecord.providerRequestId || 'Provider job pending'}</small>
                </td>
                <td><StatusPill status={requestRecord.status} /></td>
                <td>
                  <strong>{requestRecord.queuePosition > 0 ? requestRecord.queuePosition : '-'}</strong>
                  <small>{requestRecord.status === 'queued' ? 'Waiting for capacity' : 'In progress or completed'}</small>
                </td>
                <td>{formatDateTime(requestRecord.createdAt)}</td>
                <td>{formatDateTime(requestRecord.updatedAt)}</td>
              </tr>
            ))}
            {!requests.length && (
              <tr>
                <td colSpan="6" className="empty-cell">{isLoading ? 'Loading Whisper requests...' : 'No Whisper requests found.'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && requests.length > 0 && (
        <Pagination pagination={pagination} onPageChange={(page) => loadRequests(page, status)} />
      )}
    </section>
  )
}
