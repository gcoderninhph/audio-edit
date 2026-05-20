import { ArrowLeft, RefreshCw } from 'lucide-react'
import { formatDateTime } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'

function buildDetailRows(account) {
  return [
    ['Account id', String(account?.id || '-')],
    ['Name', account?.name || '-'],
    ['Bank id', account?.bankId || '-'],
    ['Bank account', account?.bankAccount || '-'],
    ['Current account', account?.isCurrent ? 'Yes' : 'No'],
    ['Created at', account?.createdAt ? formatDateTime(account.createdAt) : '-'],
    ['Updated at', account?.updatedAt ? formatDateTime(account.updatedAt) : '-'],
  ]
}

export default function IapBeneficiaryAccountDetailPanel({ account, isRefreshing = false, onBack, onRefresh }) {
  const detailRows = buildDetailRows(account)

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.manage.iap.api-key.beneficiaries.detail" title="IAP Beneficiary Account Detail Section" />
      <div className="section-toolbar">
        <div className="section-heading compact">
          <p>Payment receiver</p>
          <h2>Beneficiary account detail</h2>
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