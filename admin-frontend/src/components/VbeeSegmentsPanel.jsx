import { AlertTriangle, ArrowLeft, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { clearAdminVbeeSegmentsCache, deleteAdminVbeeSegment, fetchAdminVbeeSegmentAudioBlob, fetchAdminVbeeSegmentDetail, fetchAdminVbeeSegments } from '../api/adminVbeeApi'
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

function VbeeSegmentDetail({ onBack, onDeleted, segmentHash }) {
  const audioObjectUrlRef = useRef('')
  const [audioError, setAudioError] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [detailError, setDetailError] = useState('')
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const [segmentRecord, setSegmentRecord] = useState(null)

  const clearAudioPreview = useCallback(() => {
    if (audioObjectUrlRef.current) {
      URL.revokeObjectURL(audioObjectUrlRef.current)
      audioObjectUrlRef.current = ''
    }
    setAudioUrl('')
  }, [])

  const loadAudioUrl = useCallback(async () => {
    if (!segmentHash) return
    setAudioError('')
    setIsLoadingAudio(true)
    try {
      const audioBlob = await fetchAdminVbeeSegmentAudioBlob(segmentHash)
      clearAudioPreview()
      audioObjectUrlRef.current = URL.createObjectURL(audioBlob)
      setAudioUrl(audioObjectUrlRef.current)
    } catch (loadError) {
      clearAudioPreview()
      setAudioError(loadError.message || 'Unable to load Vbee segment audio.')
    } finally {
      setIsLoadingAudio(false)
    }
  }, [clearAudioPreview, segmentHash])

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

  const closeDeleteDialog = useCallback(() => {
    setDeleteError('')
    setDeletePassword('')
    setIsDeleteDialogOpen(false)
  }, [])

  const handleDeleteSegment = useCallback(async (event) => {
    event.preventDefault()
    setDeleteError('')
    setIsDeleting(true)
    try {
      const payload = await deleteAdminVbeeSegment(segmentHash, deletePassword)
      const result = payload.result || {}
      const deletedRequestCount = Number(result.deletedRequestCount || 0)
      const deletedRequestMessage = deletedRequestCount > 0 ? ` Removed ${formatNumber(deletedRequestCount)} empty requests.` : ''
      const successMessage = `Deleted ${formatNumber(result.segmentCount || 0)} segment rows across ${formatNumber(result.requestCount || 0)} requests, removed ${formatNumber(result.assetCount || 0)} DB assets, ${formatNumber(result.deletedRedisKeys || 0)} Redis keys, and ${formatNumber(result.deletedR2Objects || 0)} R2 objects.${deletedRequestMessage}`
      closeDeleteDialog()
      clearAudioPreview()
      if (onDeleted) {
        onDeleted(successMessage)
        return
      }
      onBack?.()
    } catch (submitError) {
      setDeleteError(submitError.message || 'Unable to delete Vbee segment.')
    } finally {
      setIsDeleting(false)
    }
  }, [clearAudioPreview, closeDeleteDialog, deletePassword, onBack, onDeleted, segmentHash])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  useEffect(() => {
    if (segmentRecord?.status === 'complete') {
      void loadAudioUrl()
      return
    }
    clearAudioPreview()
    setAudioError('')
  }, [clearAudioPreview, loadAudioUrl, segmentRecord?.hash, segmentRecord?.status])

  useEffect(() => () => {
    if (audioObjectUrlRef.current) {
      URL.revokeObjectURL(audioObjectUrlRef.current)
      audioObjectUrlRef.current = ''
    }
  }, [])

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.service.vbee.segments.detail" title="Admin React Vbee Segment Detail" />
      <div className="section-toolbar">
        <div className="section-heading compact"><p>Vbee segment</p><h2>{formatSegmentHash(segmentRecord?.hash || segmentHash)}</h2></div>
        <div className="toolbar-actions">
          <div className="button-group">
            <button type="button" className="ghost-button compact" onClick={onBack}><ArrowLeft size={17} /> Back</button>
            <button type="button" className="ghost-button compact" onClick={() => void loadDetail()} disabled={isLoading}><RefreshCw size={17} /> Refresh</button>
          </div>
          <button type="button" className="ghost-button compact danger-text" onClick={() => {
            setDeleteError('')
            setIsDeleteDialogOpen(true)
          }} disabled={isDeleting}><Trash2 size={17} /> Delete segment</button>
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
      {isDeleteDialogOpen && (
        <PasswordConfirmDialog
          description="This action permanently deletes all historical rows for this segment hash, removes any owned audio asset for it, and clears the related Vbee cache entries."
          error={deleteError}
          headingLabel="Vbee segment"
          headingTitle="Delete segment"
          isSubmitting={isDeleting}
          markerCode="admin.react.service.vbee.segments.delete-dialog"
          markerTitle="Admin React Vbee Segment Delete Dialog"
          onClose={closeDeleteDialog}
          onSubmit={handleDeleteSegment}
          password={deletePassword}
          setPassword={setDeletePassword}
          submitLabel="Delete segment"
        />
      )}
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

  const handleSegmentDeleted = useCallback((message) => {
    setError('')
    setSuccessMessage(message)
    onNavigate?.('/admin/service/vbee/segments')
  }, [onNavigate])

  if (segmentHash) {
    return <VbeeSegmentDetail segmentHash={segmentHash} onBack={() => onNavigate?.('/admin/service/vbee/segments')} onDeleted={handleSegmentDeleted} />
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