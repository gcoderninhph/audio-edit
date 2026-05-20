import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import { getPaymentPackTypeLabel } from './paymentQrDialogModel';

export function PackagePreviewCard({ locatorCode, packageBenefits, packageRecord, paymentLabel }) {
  const cardBenefits = packageBenefits.length > 0 ? packageBenefits : ['No extra benefits listed.'];

  return (
    <article className={`premium-package-card payment-package-card dev-locator-host${packageRecord?.isRecommended ? ' premium-package-card-recommended' : ''}`}>
      <DeveloperLocator code={locatorCode} title="QR Payment Package Preview Card" />
      <div className="premium-package-header-block">
        <div className="premium-package-type">{getPaymentPackTypeLabel(packageRecord?.packType)}</div>
        <div className="premium-package-title-row">
          <h3>{packageRecord?.name || 'IAP package'}</h3>
          {packageRecord?.isRecommended && <span className="premium-package-badge">Recommended</span>}
        </div>
      </div>
      <div className="premium-package-price">{paymentLabel}</div>
      <ul className="premium-package-features">
        {cardBenefits.map((benefit) => <li key={benefit}>{benefit}</li>)}
      </ul>
    </article>
  );
}

export function PaymentInfoTable({ rows }) {
  return (
    <div className="payment-info-table-wrap">
      <table className="payment-info-table">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}