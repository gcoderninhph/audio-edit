import { RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { fetchAdminIapRefundPending } from '../api/adminApi'
import { formatCurrency } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'
import IapRefundPendingDetailPanel from './IapRefundPendingDetailPanel'

export default function IapRefundPendingDialog({ onClose }) {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [refunds, setRefunds] = useState([])
  const [selectedRefundId, setSelectedRefundId] = useState(0)

  const loadRefunds = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminIapRefundPending({ pageSize: 50 })
      setRefunds(payload.refunds || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load refund pending records.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRefunds()
  }, [loadRefunds])

  const selectedRefund = refunds.find((refund) => refund.id === selectedRefundId) || null

  useEffect(() => {
    if (!selectedRefundId || selectedRefund || isLoading) {
      return
    }
    setSelectedRefundId(0)
  }, [isLoading, selectedRefund, selectedRefundId])

  if (selectedRefund) {
    return (
      <IapRefundPendingDetailPanel
        isRefreshing={isLoading}
        onBack={() => setSelectedRefundId(0)}
        onRefresh={() => void loadRefunds()}
        refund={selectedRefund}
      />
    )
  }

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.manage.iap.api-key.refund-pending" title="IAP Refund Pending Section" />
      <div className="section-toolbar">
        <div className="section-heading compact">
          <p>Manual review</p>
          <h2>Refund pending</h2>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="ghost-button compact" onClick={() => void loadRefunds()} disabled={isLoading}><RefreshCw size={17} /> Refresh</button>
          {onClose ? <button type="button" className="ghost-button compact" onClick={onClose}><X size={17} /> Hide</button> : null}
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      <div className="table-wrap">
        <table className="admin-table compact-table">
          <thead><tr><th>Transaction</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            {refunds.map((refund) => (
              <tr key={refund.id} className="clickable-row" onClick={() => setSelectedRefundId(refund.id)}>
                <td><strong>{refund.transactionCode || '-'}</strong><small>Ticket {refund.ticketId || '-'} · History {refund.historyId || '-'}</small></td>
                <td>{formatCurrency(refund.amount, 'VND')}</td>
                <td><span className="status-pill status-processing">{refund.status}</span></td>
              </tr>
            ))}
            {!refunds.length && <tr><td colSpan="3" className="empty-cell">{isLoading ? 'Loading refund pending records...' : 'No refund pending records.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
