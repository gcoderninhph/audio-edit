import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAdminOpenAiRequestDetail } from '../api/adminOpenAiApi'
import { formatDateTime, formatNumber } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'

function StatusPill({ status }) {
  return <span className={`status-pill status-${status || 'running'}`}>{status || 'running'}</span>
}

function renderDetailValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return <span className="table-prewrap-value">{value}</span>
  return <span className="table-prewrap-value">{JSON.stringify(value, null, 2)}</span>
}

function formatTokenValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  return formatNumber(value)
}

export default function OpenAiRequestDetailPanel({ onBack, requestId }) {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [requestRecord, setRequestRecord] = useState(null)

  const loadDetail = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminOpenAiRequestDetail(requestId)
      setRequestRecord(payload.request || null)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load OpenAI request.')
    } finally {
      setIsLoading(false)
    }
  }, [requestId])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const summaryRows = useMemo(() => {
    if (!requestRecord) return []
    const details = requestRecord.details || {}
    return [
      ['Request ID', requestRecord.requestId],
      ['User ID', requestRecord.userId || '-'],
      ['Request type', requestRecord.requestType || '-'],
      ['Provider', requestRecord.provider || '-'],
      ['Status', <StatusPill status={requestRecord.status} />],
      ['Model', details.model || '-'],
      ['Token name', details.tokenName || '-'],
      ['Token ID', details.tokenId || '-'],
      ['Input tokens', formatTokenValue(details.inputTokens)],
      ['Output tokens', formatTokenValue(details.outputTokens)],
      ['Total tokens', formatTokenValue(details.totalTokens)],
      ['Source file', requestRecord.sourceFileName || '-'],
      ['Output file', requestRecord.outputFileName || '-'],
      ['Target language', requestRecord.targetLanguage || '-'],
      ['Created at', formatDateTime(requestRecord.createdAt)],
      ['Updated at', formatDateTime(requestRecord.updatedAt || requestRecord.createdAt)],
    ]
  }, [requestRecord])

  const detailRows = useMemo(() => {
    if (!requestRecord?.details) return []
    const details = requestRecord.details || {}
    const preferredRows = [
      ['Request mode', details.requestMode],
      ['Temperature', details.temperature],
      ['Timeout seconds', details.timeoutSeconds],
      ['User prompt', details.userPrompt || details.promptTemplate],
      ['Error', details.error],
    ].filter(([, value]) => value !== null && value !== undefined && value !== '')
    const hiddenKeys = new Set([
      'error',
      'inputTokens',
      'model',
      'outputTokens',
      'promptTemplate',
      'requestMode',
      'temperature',
      'timeoutSeconds',
      'tokenId',
      'tokenName',
      'totalTokens',
      'userPrompt',
    ])
    const remainingRows = Object.entries(details).filter(([label]) => !hiddenKeys.has(label))
    return [...preferredRows, ...remainingRows]
  }, [requestRecord])

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.service.openai.requests.detail" title="Admin React OpenAI Request Detail" />
      <div className="section-toolbar">
        <div className="section-heading compact"><p>OpenAI request</p><h2>{requestId}</h2></div>
        <div className="toolbar-actions">
          <button type="button" className="ghost-button compact" onClick={onBack}><ArrowLeft size={17} /> Back</button>
          <button type="button" className="ghost-button compact" onClick={() => void loadDetail()} disabled={isLoading}><RefreshCw size={17} /> Refresh</button>
        </div>
      </div>

      <div className="notice notice-info">This detail view shows the saved OpenAI request record exactly as stored by the backend, with top-level request fields and provider metadata separated into tables.</div>
      {error && <div className="notice notice-error">{error}</div>}

      {requestRecord && (
        <>
          <div className="table-wrap dev-host">
            <DeveloperMarker code="admin.react.service.openai.requests.detail.summary" title="Admin React OpenAI Request Detail Summary Table" />
            <table className="admin-table compact-table">
              <thead><tr><th>Field</th><th>Value</th></tr></thead>
              <tbody>
                {summaryRows.map(([label, value]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-wrap dev-host">
            <DeveloperMarker code="admin.react.service.openai.requests.detail.metadata" title="Admin React OpenAI Request Detail Metadata Table" />
            <table className="admin-table compact-table">
              <thead><tr><th>Detail</th><th>Value</th></tr></thead>
              <tbody>
                {detailRows.map(([label, value]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{renderDetailValue(value)}</td>
                  </tr>
                ))}
                {!detailRows.length && <tr><td colSpan="2" className="empty-cell">No OpenAI request metadata.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!requestRecord && !error && <div className="empty-cell">{isLoading ? 'Loading OpenAI request...' : 'OpenAI request not found.'}</div>}
    </section>
  )
}