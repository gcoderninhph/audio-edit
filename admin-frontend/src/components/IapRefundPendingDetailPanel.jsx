import { ArrowLeft, RefreshCw } from 'lucide-react'
import { formatCurrency, formatDateTime } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'

function buildDetailRows(refund) {
  return [
    ['Record id', String(refund?.id || '-')],
    ['Transaction', refund?.transactionCode || '-'],
    ['Ticket id', refund?.ticketId ? String(refund.ticketId) : '-'],
    ['History id', refund?.historyId ? String(refund.historyId) : '-'],
    ['User id', refund?.userId || '-'],
    ['Amount', formatCurrency(refund?.amount, 'VND')],
    ['Account number', refund?.accountNumber || '-'],
    ['Status', refund?.status || '-'],
    ['Reason', refund?.reason || '-'],
    ['Created at', refund?.createdAt ? formatDateTime(refund.createdAt) : '-'],
    ['Updated at', refund?.updatedAt ? formatDateTime(refund.updatedAt) : '-'],
  ]
}

export default function IapRefundPendingDetailPanel({ isRefreshing = false, onBack, onRefresh, refund }) {
  const detailRows = buildDetailRows(refund)

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.manage.iap.api-key.refund-pending.detail" title="IAP Refund Pending Detail Section" />
      <div className="section-toolbar">
        <div className="section-heading compact">
          <p>Manual review</p>
          <h2>Refund pending detail</h2>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="ghost-button compact" onClick={onBack}><ArrowLeft size={17} /> Back</button>
          <button type="button" className="ghost-button compact" onClick={onRefresh} disabled={isRefreshing}><RefreshCw size={17} /> Refresh</button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="admin-table compact-table iap-detail-table">
          <tbody>
            {detailRows.map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}