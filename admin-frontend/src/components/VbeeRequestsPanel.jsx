import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { fetchAdminVbeeRequestDetail, fetchAdminVbeeRequests } from '../api/adminVbeeApi'
import { formatDateTime, formatNumber } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'

const STATUS_OPTIONS = ['', 'queued', 'processing', 'complete', 'failed']

function getRequestDetailPath(requestId) {
  return `/admin/service/vbee/requests/${encodeURIComponent(requestId)}`
}

function StatusPill({ status }) {
  return <span className={`status-pill status-${status || 'queued'}`}>{status || 'queued'}</span>
}

function VbeeRequestDetail({ onBack, requestId }) {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [requestRecord, setRequestRecord] = useState(null)

  const loadDetail = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminVbeeRequestDetail(requestId)
      setRequestRecord(payload.request || null)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load Vbee request.')
    } finally {
      setIsLoading(false)
    }
  }, [requestId])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.service.vbee.requests.detail" title="Admin React Vbee Request Detail" />
      <div className="section-toolbar">
        <div className="section-heading compact"><p>Vbee request</p><h2>{requestId}</h2></div>
        <div className="toolbar-actions">
          <button type="button" className="ghost-button compact" onClick={onBack}><ArrowLeft size={17} /> Back</button>
          <button type="button" className="ghost-button compact" onClick={() => void loadDetail()} disabled={isLoading}><RefreshCw size={17} /> Refresh</button>
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {requestRecord && (
        <>
          <div className="detail-summary-grid">
            <div><span>Status</span><strong><StatusPill status={requestRecord.status} /></strong></div>
            <div><span>Progress</span><strong>{requestRecord.progress}%</strong></div>
            <div><span>Segments</span><strong>{requestRecord.completedSegments}/{requestRecord.totalSegments}</strong></div>
            <div><span>Characters</span><strong>{formatNumber(requestRecord.characterCount)}</strong></div>
          </div>
          <div className="table-wrap">
            <table className="admin-table compact-table">
              <thead><tr><th>#</th><th>Text</th><th>Status</th><th>Token</th><th>Provider</th><th>Audio URL</th></tr></thead>
              <tbody>
                {(requestRecord.segments || []).map((segment) => (
                  <tr key={segment.id}>
                    <td>{segment.index + 1}</td>
                    <td><strong>{segment.text}</strong><small>{segment.startMs}ms - {segment.endMs}ms</small></td>
                    <td><StatusPill status={segment.status} /></td>
                    <td>{segment.tokenId || '-'}</td>
                    <td>{segment.providerRequestId || '-'}</td>
                    <td>{segment.audioUrl ? <a href={segment.audioUrl} target="_blank" rel="noreferrer">Open</a> : '-'}</td>
                  </tr>
                ))}
                {!(requestRecord.segments || []).length && <tr><td colSpan="6" className="empty-cell">No Vbee segments.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!requestRecord && !error && <div className="empty-cell">{isLoading ? 'Loading Vbee request...' : 'Vbee request not found.'}</div>}
    </section>
  )
}

export default function VbeeRequestsPanel({ onNavigate, requestId }) {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [requests, setRequests] = useState([])
  const [status, setStatus] = useState('')

  const loadRequests = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminVbeeRequests({ status })
      setRequests(payload.requests || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load Vbee requests.')
    } finally {
      setIsLoading(false)
    }
  }, [status])

  useEffect(() => {
    if (!requestId) void loadRequests()
  }, [loadRequests, requestId])

  if (requestId) {
    return <VbeeRequestDetail requestId={requestId} onBack={() => onNavigate?.('/admin/service/vbee/requests')} />
  }

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.service.vbee.requests" title="Admin React Vbee Requests" />
      <div className="section-toolbar">
        <div className="section-heading compact"><p>Vbee</p><h2>Request</h2></div>
        <div className="toolbar-actions">
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_OPTIONS.map((option) => <option key={option || 'all'} value={option}>{option || 'all'}</option>)}
          </select>
          <button type="button" className="ghost-button compact" onClick={() => void loadRequests()} disabled={isLoading}><RefreshCw size={17} /> Refresh</button>
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      <div className="table-wrap">
        <table className="admin-table compact-table">
          <thead><tr><th>Request</th><th>User</th><th>Status</th><th>Segments</th><th>Progress</th><th>Updated</th></tr></thead>
          <tbody>
            {requests.map((record) => (
              <tr key={record.requestId} className="clickable-row" onClick={() => onNavigate?.(getRequestDetailPath(record.requestId))}>
                <td><strong>{record.requestId}</strong><small>{record.voiceCode || record.language || '-'}</small></td>
                <td>{record.userId}</td>
                <td><StatusPill status={record.status} /></td>
                <td>{record.completedSegments}/{record.totalSegments}</td>
                <td>{record.progress}%</td>
                <td>{formatDateTime(record.updatedAt || record.createdAt)}</td>
              </tr>
            ))}
            {!requests.length && <tr><td colSpan="6" className="empty-cell">{isLoading ? 'Loading Vbee requests...' : 'No Vbee requests yet.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}