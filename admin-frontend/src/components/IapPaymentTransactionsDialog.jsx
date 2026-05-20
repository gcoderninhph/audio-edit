import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { fetchAdminIapPaymentTransactions } from '../api/adminApi'
import { formatCurrency, formatDateTime } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'

export default function IapPaymentTransactionsDialog({ onTransactionSelect }) {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [transactions, setTransactions] = useState([])

  const loadTransactions = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminIapPaymentTransactions({ pageSize: 50 })
      setTransactions(payload.transactions || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load payment transactions.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const canOpenDetail = typeof onTransactionSelect === 'function'

  useEffect(() => {
    void loadTransactions()
  }, [loadTransactions])

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.manage.iap.api-key.payment-transactions" title="IAP Payment Transactions Section" />
      <div className="section-toolbar">
        <div className="section-heading compact">
          <p>Payment processing</p>
          <h2>Transactions</h2>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="ghost-button compact" onClick={() => void loadTransactions()} disabled={isLoading}><RefreshCw size={17} /> Refresh</button>
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      <div className="table-wrap">
        <table className="admin-table compact-table">
          <thead><tr><th>Transaction</th><th>Pack</th><th>Amount</th><th>Status</th><th>Updated</th><th>Reason</th></tr></thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id} className={canOpenDetail ? 'clickable-row' : ''} onClick={canOpenDetail ? () => onTransactionSelect(transaction.id) : undefined}>
                <td><strong>{transaction.transactionCode}</strong><small>{transaction.id}</small></td>
                <td><strong>{transaction.packageName}</strong><small>{transaction.packageId}</small></td>
                <td>{formatCurrency(transaction.amount, transaction.currency)}</td>
                <td><span className={`status-pill status-${transaction.status}`}>{transaction.status}</span></td>
                <td>{formatDateTime(transaction.completedAt || transaction.updatedAt)}</td>
                <td>{transaction.failureReason || '-'}</td>
              </tr>
            ))}
            {!transactions.length && <tr><td colSpan="6" className="empty-cell">{isLoading ? 'Loading payment transactions...' : 'No payment transactions yet.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
