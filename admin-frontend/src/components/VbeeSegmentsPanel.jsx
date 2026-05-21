import { AlertTriangle, ArrowLeft, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { clearAdminVbeeSegmentsCache, fetchAdminVbeeSegmentAudioUrl, fetchAdminVbeeSegmentDetail, fetchAdminVbeeSegments } from '../api/adminVbeeApi'
import { formatDateTime, formatNumber } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'
import Pagination from './Pagination'

const STATUS_OPTIONS = ['processing', 'complete', 'queued', 'failed', '']
const DEFAULT_PAGE_SIZE = 10

function getSegmentDetailPath(segmentHash) {
  return `/admin/service/vbee/segments/${encodeURIComponent(segmentHash)}`
}

function StatusPill({ status }) {
  return <span className={`status-pill status-${status || 'queued'}`}>{status || 'queued'}</span>
}

function formatOptionalDateTime(value) {
  return value ? formatDateTime(value) : '-'
}

function truncateText(value, maxLength = 15) {
  const safeValue = String(value || '').trim()
  if (!safeValue) return '-'
  return safeValue.length > maxLength ? `${safeValue.slice(0, maxLength)}...` : safeValue
}

function formatSegmentHash(hash) {
  const normalizedHash = String(hash || '').replace(/^vbee-audio-/, '')
  return truncateText(normalizedHash, 15)
}

function ClearCacheDialog({ error, isSubmitting, onClose, onSubmit, password, setPassword }) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="credit-dialog package-dialog dev-host" onSubmit={onSubmit}>
        <DeveloperMarker code="admin.react.service.vbee.segments.clear-cache-dialog" title="Admin React Vbee Segments Clear Cache Dialog" />
        <div className="section-heading compact">
          <p>Vbee segments</p>
          <h2>Clear cache</h2>
        </div>
        <div className="notice notice-error">
          <strong className="danger-text"><AlertTriangle size={16} /> This action permanently clears all Vbee request or segment DB data and deletes all `vbee-audio-*` objects from Cloudflare R2.</strong>
        </div>
        {error && <div className="notice notice-error">{error}</div>}
        <label className="field">
          <span>Admin password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        <div className="dialog-actions">
          <button type="button" className="ghost-button" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Clearing...' : 'Clear cache'}</button>
        </div>
      </form>
    </div>
  )
}

function VbeeSegmentDetail({ onBack, segmentHash }) {
  const [audioError, setAudioError] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [detailError, setDetailError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const [segmentRecord, setSegmentRecord] = useState(null)

  const loadAudioUrl = useCallback(async () => {
    if (!segmentHash) return
    setAudioError('')
    setIsLoadingAudio(true)
    try {
      const payload = await fetchAdminVbeeSegmentAudioUrl(segmentHash)
      setAudioUrl(payload.audioUrl || '')
    } catch (loadError) {
      setAudioUrl('')
      setAudioError(loadError.message || 'Unable to load Vbee segment audio.')
    } finally {
      setIsLoadingAudio(false)
    }
  }, [segmentHash])

  const loadDetail = useCallback(async () => {
    setIsLoading(true)
    setDetailError('')
    try {
      const payload = await fetchAdminVbeeSegmentDetail(segmentHash)
      setSegmentRecord(payload.segment || null)
    } catch (loadError) {
      setSegmentRecord(null)
      setDetailError(loadError.message || 'Unable to load Vbee segment.')
    } finally {
      setIsLoading(false)
    }
  }, [segmentHash])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  useEffect(() => {
    if (segmentRecord?.status === 'complete') {
      void loadAudioUrl()
      return
    }
    setAudioUrl('')
    setAudioError('')
  }, [loadAudioUrl, segmentRecord?.hash, segmentRecord?.status])

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.service.vbee.segments.detail" title="Admin React Vbee Segment Detail" />
      <div className="section-toolbar">
        <div className="section-heading compact"><p>Vbee segment</p><h2>{segmentHash}</h2></div>
        <div className="toolbar-actions">
          <div className="button-group">
            <button type="button" className="ghost-button compact" onClick={onBack}><ArrowLeft size={17} /> Back</button>
            <button type="button" className="ghost-button compact" onClick={() => void loadDetail()} disabled={isLoading}><RefreshCw size={17} /> Refresh</button>
          </div>
        </div>
      </div>

      {detailError && <div className="notice notice-error">{detailError}</div>}
      {segmentRecord && (
        <>
          <div className="detail-summary-grid">
            <div><span>Status</span><strong><StatusPill status={segmentRecord.status} /></strong></div>
            <div><span>Reuse</span><strong>{formatNumber(segmentRecord.reuseCount)}</strong></div>
            <div><span>Requests</span><strong>{formatNumber(segmentRecord.requestCount)}</strong></div>
            <div><span>Characters</span><strong>{formatNumber(segmentRecord.characterCount)}</strong></div>
          </div>

          <div className="table-wrap">
            <table className="admin-table compact-table">
              <tbody>
                <tr><th>Text</th><td>{segmentRecord.text || '-'}</td></tr>
                <tr><th>Language</th><td>{segmentRecord.language || '-'}</td></tr>
                <tr><th>Voice</th><td>{segmentRecord.voiceCode || '-'}</td></tr>
                <tr><th>Provider request</th><td>{segmentRecord.providerRequestId || '-'}</td></tr>
                <tr><th>Token</th><td>{segmentRecord.tokenId || '-'}</td></tr>
                <tr><th>Expires at</th><td>{formatOptionalDateTime(segmentRecord.expiresAt)}</td></tr>
                <tr><th>Updated</th><td>{formatDateTime(segmentRecord.updatedAt || segmentRecord.createdAt)}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="panel section-card">
            <div className="section-toolbar">
              <div className="section-heading compact"><p>Audio</p><h3>Preview</h3></div>
              {segmentRecord.status === 'complete' && <button type="button" className="ghost-button compact" onClick={() => void loadAudioUrl()} disabled={isLoadingAudio}><RefreshCw size={17} /> Refresh audio</button>}
            </div>
            {audioError && <div className="notice notice-error">{audioError}</div>}
            {segmentRecord.status !== 'complete' && <div className="empty-cell">Segment audio is still processing.</div>}
            {segmentRecord.status === 'complete' && audioUrl && <audio className="detail-audio-player" controls preload="none" src={audioUrl} />}
            {segmentRecord.status === 'complete' && !audioUrl && !audioError && <div className="empty-cell">{isLoadingAudio ? 'Loading segment audio...' : 'Segment audio is not available.'}</div>}
          </div>

          <div className="table-wrap">
            <table className="admin-table compact-table">
              <thead><tr><th>Request</th><th>Status</th><th>Time</th><th>Provider</th><th>Window</th></tr></thead>
              <tbody>
                {(segmentRecord.usages || []).map((usage) => (
                  <tr key={usage.id}>
                    <td><strong>{usage.requestId}</strong><small>Segment {usage.index + 1}</small></td>
                    <td><StatusPill status={usage.status} /></td>
                    <td>{formatDateTime(usage.updatedAt || usage.createdAt)}</td>
                    <td>{usage.providerRequestId || '-'}</td>
                    <td>{formatNumber(usage.startMs)}ms - {formatNumber(usage.endMs)}ms</td>
                  </tr>
                ))}
                {!(segmentRecord.usages || []).length && <tr><td colSpan="5" className="empty-cell">No segment usage history.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!segmentRecord && !detailError && <div className="empty-cell">{isLoading ? 'Loading Vbee segment...' : 'Vbee segment not found.'}</div>}
    </section>
  )
}

export default function VbeeSegmentsPanel({ onNavigate, segmentHash }) {
  const [clearError, setClearError] = useState('')
  const [clearPassword, setClearPassword] = useState('')
  const [error, setError] = useState('')
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, pageSize: DEFAULT_PAGE_SIZE, totalItems: 0, totalPages: 1, hasNext: false, hasPrevious: false })
  const [segments, setSegments] = useState([])
  const [status, setStatus] = useState('processing')
  const [successMessage, setSuccessMessage] = useState('')

  const loadSegments = useCallback(async (targetPage = page, targetStatus = status) => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminVbeeSegments({ page: targetPage, pageSize: DEFAULT_PAGE_SIZE, status: targetStatus })
      setSegments(payload.segments || [])
      const nextPagination = payload.pagination || { page: targetPage, pageSize: DEFAULT_PAGE_SIZE, totalItems: 0, totalPages: 1, hasNext: false, hasPrevious: false }
      setPagination(nextPagination)
      if (nextPagination.page !== targetPage) setPage(nextPagination.page)
    } catch (loadError) {
      setSegments([])
      setPagination({ page: 1, pageSize: DEFAULT_PAGE_SIZE, totalItems: 0, totalPages: 1, hasNext: false, hasPrevious: false })
      setError(loadError.message || 'Unable to load Vbee segments.')
    } finally {
      setIsLoading(false)
    }
  }, [page, status])

  const closeClearDialog = useCallback(() => {
    setClearError('')
    setClearPassword('')
    setIsClearDialogOpen(false)
  }, [])

  const handleClearCache = useCallback(async (event) => {
    event.preventDefault()
    setClearError('')
    setSuccessMessage('')
    setIsClearing(true)
    try {
      const payload = await clearAdminVbeeSegmentsCache(clearPassword)
      const result = payload.result || {}
      closeClearDialog()
      setPage(1)
      await loadSegments(1, status)
      setSuccessMessage(
        `Cleared ${formatNumber(result.requestCount || 0)} requests, ${formatNumber(result.segmentCount || 0)} segments, ${formatNumber(result.assetCount || 0)} DB assets, ${formatNumber(result.deletedRedisKeys || 0)} Redis keys, and ${formatNumber(result.deletedR2Objects || 0)} R2 objects.`
      )
    } catch (submitError) {
      setClearError(submitError.message || 'Unable to clear Vbee segment cache.')
    } finally {
      setIsClearing(false)
    }
  }, [clearPassword, closeClearDialog, loadSegments, status])

  useEffect(() => {
    if (!segmentHash) void loadSegments(page, status)
  }, [loadSegments, page, segmentHash, status])

  if (segmentHash) {
    return <VbeeSegmentDetail segmentHash={segmentHash} onBack={() => onNavigate?.('/admin/service/vbee/segments')} />
  }

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.service.vbee.segments" title="Admin React Vbee Segments" />
      <div className="section-toolbar">
        <div className="section-heading compact"><p>Vbee</p><h2>Segments</h2></div>
        <div className="toolbar-actions">
          <select value={status} onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}>
            {STATUS_OPTIONS.map((option) => <option key={option || 'all'} value={option}>{option || 'all'}</option>)}
          </select>
          <button type="button" className="ghost-button compact" onClick={() => void loadSegments(page, status)} disabled={isLoading}><RefreshCw size={17} /> Refresh</button>
          <button type="button" className="ghost-button compact danger-text" onClick={() => {
            setClearError('')
            setSuccessMessage('')
            setIsClearDialogOpen(true)
          }} disabled={isClearing}><Trash2 size={17} /> Clear cache</button>
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {successMessage && <div className="notice notice-info">{successMessage}</div>}

      <div className="table-wrap">
        <table className="admin-table compact-table">
          <thead><tr><th>Text</th><th>Language</th><th>Voice</th><th>Reuse</th><th>Status</th></tr></thead>
          <tbody>
            {segments.map((segment) => (
              <tr key={segment.hash} className="clickable-row" onClick={() => onNavigate?.(getSegmentDetailPath(segment.hash))}>
                <td>
                  <strong className="table-truncate" title={segment.text || ''}>{truncateText(segment.text || '-', 15)}</strong>
                  <small className="table-truncate table-truncate-subtle" title={segment.hash || ''}>{formatSegmentHash(segment.hash)}</small>
                </td>
                <td>{segment.language || '-'}</td>
                <td>{segment.voiceCode || '-'}</td>
                <td>{formatNumber(segment.reuseCount)}</td>
                <td><StatusPill status={segment.status} /></td>
              </tr>
            ))}
            {!segments.length && <tr><td colSpan="5" className="empty-cell">{isLoading ? 'Loading Vbee segments...' : 'No Vbee segments yet.'}</td></tr>}
          </tbody>
        </table>
      </div>

      <Pagination itemLabel="segments" pagination={pagination} onPageChange={setPage} />

      {isClearDialogOpen && (
        <ClearCacheDialog
          error={clearError}
          isSubmitting={isClearing}
          onClose={closeClearDialog}
          onSubmit={handleClearCache}
          password={clearPassword}
          setPassword={setClearPassword}
        />
      )}
    </section>
  )
}