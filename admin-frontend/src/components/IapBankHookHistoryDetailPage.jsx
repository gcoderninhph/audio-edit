import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAdminIapBankHookHistoryDetail } from '../api/adminApi'
import { formatDateTime, formatNumber } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'

function getJsonPayload(payload) {
  try {
    return JSON.stringify(payload || {}, null, 2)
  } catch {
    return '{}'
  }
}

function getBankTransactionTime(record) {
  return record?.transactionDate || (record?.transactionAt ? formatDateTime(record.transactionAt) : '-')
}

function buildDetailRows(record, historyId) {
  return [
    ['Record id', String(historyId)],
    ['Received at', record?.receivedAt ? formatDateTime(record.receivedAt) : '-'],
    ['Bank transaction time', getBankTransactionTime(record)],
    ['API key', record?.apiKeyName ? `${record.apiKeyName} (#${record.apiKeyId})` : '-'],
    ['Gateway', record?.gateway || '-'],
    ['Transfer amount', formatNumber(record?.transferAmount)],
    ['Accumulated', formatNumber(record?.accumulated)],
    ['Transfer type', record?.transferType || '-'],
    ['Account number', record?.accountNumber || '-'],
    ['Sub account', record?.subAccount || '-'],
    ['Code', record?.code || '-'],
    ['Reference code', record?.referenceCode || '-'],
    ['Transfer content', record?.content || '-'],
    ['Description', record?.description || '-'],
  ]
}

export default function IapBankHookHistoryDetailPage({ embedded = false, historyId, onBack, onHeaderActionsChange, onNavigate }) {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [record, setRecord] = useState(null)

  const loadDetail = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminIapBankHookHistoryDetail(historyId)
      setRecord(payload.historyRecord || null)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load bank hook transaction detail.')
    } finally {
      setIsLoading(false)
    }
  }, [historyId])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const headerActions = useMemo(() => ([
    <button key="back" type="button" className="ghost-button compact" onClick={() => onNavigate('/admin/iap/bank-hook-history')}>
      <ArrowLeft size={17} /> Back
    </button>,
    <button key="refresh" type="button" className="ghost-button compact" onClick={() => void loadDetail()} disabled={isLoading}>
      <RefreshCw size={17} /> Refresh
    </button>,
  ]), [isLoading, loadDetail, onNavigate])

  useEffect(() => {
    if (embedded) {
      return undefined
    }
    onHeaderActionsChange?.(headerActions)
    return () => onHeaderActionsChange?.(null)
  }, [embedded, headerActions, onHeaderActionsChange])

  const detailRows = record ? buildDetailRows(record, historyId) : []
  const summaryHeading = (
    <div className="section-heading compact">
      <p>Bank hook transaction</p>
      <h2>{record?.referenceCode || record?.code || `Transaction #${historyId}`}</h2>
    </div>
  )
  const summaryPanel = (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.manage.iap.bank-hook-history.detail.summary" title="Admin React IAP Bank Hook History Detail Summary" />
      {embedded ? (
        <div className="section-toolbar">
          {summaryHeading}
          <div className="toolbar-actions">
            <button type="button" className="ghost-button compact" onClick={onBack}><ArrowLeft size={17} /> Back</button>
            <button type="button" className="ghost-button compact" onClick={() => void loadDetail()} disabled={isLoading}><RefreshCw size={17} /> Refresh</button>
          </div>
        </div>
      ) : summaryHeading}

      {error && <div className="notice notice-error">{error}</div>}
      {isLoading && <div className="notice notice-info">Loading bank hook transaction detail...</div>}

      {record && (
        <div className="table-wrap">
          <table className="admin-table compact-table iap-detail-table">
            <tbody>
              {detailRows.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{value || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
  const payloadPanel = (
    <section className="panel dev-host">
      <DeveloperMarker code="admin.react.manage.iap.bank-hook-history.detail.payload" title="Admin React IAP Bank Hook History Detail Payload" />
      <div className="section-heading compact">
        <p>Payload</p>
        <h2>Raw bank payload</h2>
      </div>
      <pre className="iap-history-payload">{getJsonPayload(record?.payload)}</pre>
    </section>
  )

  return (
    <div className="page-stack dev-host">
      <DeveloperMarker code="admin.react.manage.iap.bank-hook-history.detail" title="Admin React IAP Bank Hook History Detail" />
      {summaryPanel}
      {payloadPanel}
    </div>
  )
}