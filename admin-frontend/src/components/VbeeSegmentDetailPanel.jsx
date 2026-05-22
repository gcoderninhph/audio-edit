import { AlertTriangle, ArrowLeft, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteAdminVbeeSegment, fetchAdminVbeeSegmentAudioBlob, fetchAdminVbeeSegmentDetail } from '../api/adminVbeeApi'
import { formatDateTime, formatNumber } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'

function StatusPill({ status }) {
  return <span className={`status-pill status-${status || 'queued'}`}>{status || 'queued'}</span>
}

function formatOptionalDateTime(value) {
  return value ? formatDateTime(value) : '-'
}

function formatSegmentHash(hash) {
  const normalizedHash = String(hash || '').replace(/^vbee-audio-/, '')
  if (!normalizedHash) return '-'
  return normalizedHash.length > 5 ? `...${normalizedHash.slice(-5)}` : normalizedHash
}

function getAudioStateMessage(segmentRecord, failureDetails) {
  if (!segmentRecord) return 'Segment audio is unavailable.'
  if (segmentRecord.status === 'failed') {
    return failureDetails?.summary || segmentRecord.errorMessage || 'Segment failed before audio was generated.'
  }
  if (segmentRecord.status === 'queued') {
    return 'Segment audio is queued and has not started yet.'
  }
  return 'Segment audio is still processing.'
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

export default function VbeeSegmentDetailPanel({ onBack, onDeleted, segmentHash }) {
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
  const failureDetails = segmentRecord?.failureDetails || null

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
      {segmentRecord?.status === 'failed' && (failureDetails?.summary || segmentRecord.errorMessage) && <div className="notice notice-error">{failureDetails?.summary || segmentRecord.errorMessage}</div>}
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
                {(failureDetails?.summary || segmentRecord.errorMessage) && <tr><th>Failure reason</th><td>{failureDetails?.summary || segmentRecord.errorMessage}</td></tr>}
                <tr><th>Updated</th><td>{formatDateTime(segmentRecord.updatedAt || segmentRecord.createdAt)}</td></tr>
              </tbody>
            </table>
          </div>

          {failureDetails && (
            <div className="panel section-card">
              <div className="section-toolbar">
                <div className="section-heading compact"><p>Failure</p><h3>Detail</h3></div>
              </div>

              <div className="detail-summary-grid">
                <div><span>Stage</span><strong>{failureDetails.stageLabel || '-'}</strong></div>
                <div><span>Failed usages</span><strong>{formatNumber(failureDetails.failedUsageCount)}</strong></div>
                <div><span>Failed requests</span><strong>{formatNumber(failureDetails.failedRequestCount)}</strong></div>
                <div><span>Latest failure</span><strong>{formatOptionalDateTime(failureDetails.latestFailureAt)}</strong></div>
              </div>

              <div className="table-wrap">
                <table className="admin-table compact-table">
                  <tbody>
                    <tr><th>Latest reason</th><td>{failureDetails.summary || '-'}</td></tr>
                    <tr><th>Latest request</th><td>{failureDetails.latestRequestId || '-'}</td></tr>
                    <tr><th>Latest provider request</th><td>{failureDetails.latestProviderRequestId || '-'}</td></tr>
                    <tr><th>Latest token</th><td>{failureDetails.latestTokenId || '-'}</td></tr>
                    <tr><th>Language</th><td>{failureDetails.latestLanguage || segmentRecord.language || '-'}</td></tr>
                    <tr><th>Voice</th><td>{failureDetails.latestVoiceCode || segmentRecord.voiceCode || '-'}</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="table-wrap">
                <table className="admin-table compact-table">
                  <thead><tr><th>Time</th><th>Stage</th><th>Request</th><th>Provider</th><th>Reason</th></tr></thead>
                  <tbody>
                    {(failureDetails.recentFailures || []).map((failure, index) => (
                      <tr key={`${failure.requestId || 'request'}-${failure.updatedAt || index}-${index}`}>
                        <td>{formatOptionalDateTime(failure.updatedAt)}</td>
                        <td>{failure.stageLabel || '-'}</td>
                        <td><strong>{failure.requestId || '-'}</strong></td>
                        <td>{failure.providerRequestId || '-'}</td>
                        <td>{failure.errorMessage || '-'}</td>
                      </tr>
                    ))}
                    {!(failureDetails.recentFailures || []).length && <tr><td colSpan="5" className="empty-cell">No detailed failure events recorded.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="panel section-card">
            <div className="section-toolbar">
              <div className="section-heading compact"><p>Audio</p><h3>Preview</h3></div>
              {segmentRecord.status === 'complete' && <button type="button" className="ghost-button compact" onClick={() => void loadAudioUrl()} disabled={isLoadingAudio}><RefreshCw size={17} /> Refresh audio</button>}
            </div>
            {audioError && <div className="notice notice-error">{audioError}</div>}
            {segmentRecord.status === 'complete' && audioUrl && <audio className="detail-audio-player" controls preload="none" src={audioUrl} />}
            {segmentRecord.status === 'complete' && !audioUrl && !audioError && <div className="empty-cell">{isLoadingAudio ? 'Loading segment audio...' : 'Segment audio is not available.'}</div>}
            {segmentRecord.status !== 'complete' && <div className={`empty-cell${segmentRecord.status === 'failed' ? ' danger-text' : ''}`}>{getAudioStateMessage(segmentRecord, failureDetails)}</div>}
          </div>

          <div className="table-wrap">
            <table className="admin-table compact-table">
              <thead><tr><th>Request</th><th>Status</th><th>Time</th><th>Provider</th><th>Window</th><th>Error</th></tr></thead>
              <tbody>
                {(segmentRecord.usages || []).map((usage) => (
                  <tr key={usage.id}>
                    <td><strong>{usage.requestId}</strong><small>Segment {usage.index + 1}</small></td>
                    <td><StatusPill status={usage.status} /></td>
                    <td>{formatDateTime(usage.updatedAt || usage.createdAt)}</td>
                    <td>{usage.providerRequestId || '-'}</td>
                    <td>{formatNumber(usage.startMs)}ms - {formatNumber(usage.endMs)}ms</td>
                    <td>{usage.errorMessage || '-'}</td>
                  </tr>
                ))}
                {!(segmentRecord.usages || []).length && <tr><td colSpan="6" className="empty-cell">No segment usage history.</td></tr>}
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