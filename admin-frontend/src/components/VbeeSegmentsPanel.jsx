import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { clearAdminVbeeSegmentsCache, fetchAdminVbeeSegments } from '../api/adminVbeeApi'
import { formatNumber } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'
import Pagination from './Pagination'
import VbeeSegmentDetailPanel from './VbeeSegmentDetailPanel'

const STATUS_OPTIONS = ['processing', 'complete', 'queued', 'failed', '']
const DEFAULT_PAGE_SIZE = 10

function getSegmentDetailPath(segmentHash) {
  return `/admin/service/vbee/segments/${encodeURIComponent(segmentHash)}`
}

function StatusPill({ status }) {
  return <span className={`status-pill status-${status || 'queued'}`}>{status || 'queued'}</span>
}

function truncateText(value, maxLength = 15) {
  const safeValue = String(value || '').trim()
  if (!safeValue) return '-'
  return safeValue.length > maxLength ? `${safeValue.slice(0, maxLength)}...` : safeValue
}

function formatSegmentHash(hash) {
  const normalizedHash = String(hash || '').replace(/^vbee-audio-/, '')
  if (!normalizedHash) return '-'
  return normalizedHash.length > 5 ? `...${normalizedHash.slice(-5)}` : normalizedHash
}

function formatVoiceCode(value) {
  return truncateText(value, 10)
}

function PasswordConfirmDialog({ description, error, headingLabel, headingTitle, isSubmitting, markerCode, markerTitle, onClose, onSubmit, password, setPassword, submitLabel }) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="credit-dialog package-dialog dev-host" onSubmit={onSubmit}>
        <DeveloperMarker code={markerCode} title={markerTitle} />
        <div className="section-heading compact">
          <p>{headingLabel}</p>
          <h2>{headingTitle}</h2>
        </div>
        <div className="notice notice-error">
          <strong className="danger-text"><AlertTriangle size={16} /> {description}</strong>
        </div>
        {error && <div className="notice notice-error">{error}</div>}
        <label className="field">
          <span>Admin password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        <div className="dialog-actions">
          <button type="button" className="ghost-button" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Confirming...' : submitLabel}</button>
        </div>
      </form>
    </div>
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

  const handleSegmentDeleted = useCallback((message) => {
    setError('')
    setSuccessMessage(message)
    onNavigate?.('/admin/service/vbee/segments')
  }, [onNavigate])

  if (segmentHash) {
    return <VbeeSegmentDetailPanel segmentHash={segmentHash} onBack={() => onNavigate?.('/admin/service/vbee/segments')} onDeleted={handleSegmentDeleted} />
  }

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.service.vbee.segments" title="Admin React Vbee Segments" />
      <div className="section-toolbar">
        <div className="section-heading compact"><p>Vbee</p><h2>Segments</h2></div>
        <div className="toolbar-actions">
          <div className="button-group">
            <select className="ghost-select compact" value={status} onChange={(event) => {
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
                  <small className="table-truncate table-truncate-subtle" title={formatSegmentHash(segment.hash)}>{formatSegmentHash(segment.hash)}</small>
                </td>
                <td>{segment.language || '-'}</td>
                <td><span className="table-truncate" title={segment.voiceCode || ''}>{formatVoiceCode(segment.voiceCode)}</span></td>
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
        <PasswordConfirmDialog
          description="This action permanently clears all Vbee request or segment DB data and deletes all `vbee-audio-*` objects from Cloudflare R2."
          error={clearError}
          headingLabel="Vbee segments"
          headingTitle="Clear cache"
          isSubmitting={isClearing}
          markerCode="admin.react.service.vbee.segments.clear-cache-dialog"
          markerTitle="Admin React Vbee Segments Clear Cache Dialog"
          onClose={closeClearDialog}
          onSubmit={handleClearCache}
          password={clearPassword}
          setPassword={setClearPassword}
          submitLabel="Clear cache"
        />
      )}
    </section>
  )
}