import { RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { fetchAdminIapRefundPending } from '../api/adminApi'
import { formatCurrency, formatDateTime } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'

export default function IapRefundPendingDialog({ onClose }) {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [refunds, setRefunds] = useState([])

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
          <thead><tr><th>Record</th><th>Transaction</th><th>Amount</th><th>Account</th><th>Status</th><th>Reason</th><th>Created</th></tr></thead>
          <tbody>
            {refunds.map((refund) => (
              <tr key={refund.id}>
                <td><strong>{refund.id}</strong><small>History {refund.historyId || '-'}</small></td>
                <td><strong>{refund.transactionCode || '-'}</strong><small>Ticket {refund.ticketId || '-'}</small></td>
                <td>{formatCurrency(refund.amount, 'VND')}</td>
                <td>{refund.accountNumber || '-'}</td>
                <td><span className="status-pill status-processing">{refund.status}</span></td>
                <td>{refund.reason}</td>
                <td>{formatDateTime(refund.createdAt)}</td>
              </tr>
            ))}
            {!refunds.length && <tr><td colSpan="7" className="empty-cell">{isLoading ? 'Loading refund pending records...' : 'No refund pending records.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
