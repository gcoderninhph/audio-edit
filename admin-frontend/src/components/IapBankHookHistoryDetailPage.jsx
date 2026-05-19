import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAdminIapBankHookHistoryDetail } from '../api/adminApi'
import { formatDateTime, formatNumber } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'

function DetailItem({ label, value }) {
  return (
    <div className="iap-history-detail-item">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  )
}

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

export default function IapBankHookHistoryDetailPage({ historyId, onHeaderActionsChange, onNavigate }) {
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
    onHeaderActionsChange?.(headerActions)
    return () => onHeaderActionsChange?.(null)
  }, [headerActions, onHeaderActionsChange])

  return (
    <div className="page-stack dev-host">
      <DeveloperMarker code="admin.react.manage.iap.bank-hook-history.detail" title="Admin React IAP Bank Hook History Detail" />

      <section className="panel dev-host">
        <DeveloperMarker code="admin.react.manage.iap.bank-hook-history.detail.summary" title="Admin React IAP Bank Hook History Detail Summary" />
        <div className="section-heading compact">
          <p>Bank hook transaction</p>
          <h2>{record?.referenceCode || record?.code || `Transaction #${historyId}`}</h2>
          <span>{record?.apiKeyName ? `${record.apiKeyName} · API key #${record.apiKeyId}` : `Record #${historyId}`}</span>
        </div>

        {error && <div className="notice notice-error">{error}</div>}
        {isLoading && <div className="notice notice-info">Loading bank hook transaction detail...</div>}

        {record && (
          <div className="iap-history-detail-grid">
            <DetailItem label="Received at" value={formatDateTime(record.receivedAt)} />
            <DetailItem label="Bank transaction time" value={getBankTransactionTime(record)} />
            <DetailItem label="API key" value={record.apiKeyName ? `${record.apiKeyName} (#${record.apiKeyId})` : '-'} />
            <DetailItem label="Gateway" value={record.gateway} />
            <DetailItem label="Transfer amount" value={formatNumber(record.transferAmount)} />
            <DetailItem label="Accumulated" value={formatNumber(record.accumulated)} />
            <DetailItem label="Transfer type" value={record.transferType} />
            <DetailItem label="Account number" value={record.accountNumber} />
            <DetailItem label="Sub account" value={record.subAccount} />
            <DetailItem label="Code" value={record.code} />
            <DetailItem label="Reference code" value={record.referenceCode} />
            <DetailItem label="Transfer content" value={record.content} />
            <DetailItem label="Description" value={record.description} />
          </div>
        )}
      </section>

      <section className="panel dev-host">
        <DeveloperMarker code="admin.react.manage.iap.bank-hook-history.detail.payload" title="Admin React IAP Bank Hook History Detail Payload" />
        <div className="section-heading compact">
          <p>Payload</p>
          <h2>Raw bank payload</h2>
        </div>
        <pre className="iap-history-payload">{getJsonPayload(record?.payload)}</pre>
      </section>
    </div>
  )
}