import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { fetchAdminIapPaymentTransactionDetail } from '../api/adminApi'
import { formatCurrency, formatDateTime } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'

function formatOptionalDateTime(value) {
  return value ? formatDateTime(value) : '-'
}

export default function IapPaymentTransactionDetailPanel({ onBack, transactionId }) {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [transaction, setTransaction] = useState(null)

  const loadTransaction = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminIapPaymentTransactionDetail(transactionId)
      setTransaction(payload.transaction || null)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load payment transaction detail.')
    } finally {
      setIsLoading(false)
    }
  }, [transactionId])

  useEffect(() => {
    void loadTransaction()
  }, [loadTransaction])

  const detailRows = transaction ? [
    ['Transaction code', transaction.transactionCode],
    ['Status', transaction.status],
    ['Package', transaction.packageName],
    ['Package id', transaction.packageId],
    ['Pack type', transaction.packType],
    ['Amount', formatCurrency(transaction.amount, transaction.currency)],
    ['User id', transaction.userId],
    ['Beneficiary', transaction.beneficiaryName],
    ['Bank id', transaction.bankId],
    ['Bank account', transaction.bankAccount],
    ['History id', transaction.historyId ? String(transaction.historyId) : '-'],
    ['Created at', formatOptionalDateTime(transaction.createdAt)],
    ['Updated at', formatOptionalDateTime(transaction.updatedAt)],
    ['Expires at', formatOptionalDateTime(transaction.expiresAt)],
    ['Completed at', formatOptionalDateTime(transaction.completedAt)],
    ['Failure reason', transaction.failureReason || '-'],
  ] : []

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.manage.iap.api-key.payment-transactions.detail" title="IAP Payment Transaction Detail Section" />
      <div className="section-toolbar">
        <div className="section-heading compact">
          <p>Payment processing</p>
          <h2>Transaction detail</h2>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="ghost-button compact" onClick={onBack}><ArrowLeft size={17} /> Back</button>
          <button type="button" className="ghost-button compact" onClick={() => void loadTransaction()} disabled={isLoading}><RefreshCw size={17} /> Refresh</button>
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {isLoading && <div className="notice notice-info">Loading payment transaction detail...</div>}

      {transaction && (
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
}