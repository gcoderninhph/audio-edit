import { CreditCard, History, Landmark, RotateCcw } from 'lucide-react'
import DeveloperMarker from './DeveloperMarker'
import IapBeneficiaryAccountsDialog from './IapBeneficiaryAccountsDialog'
import IapBankHookHistoryPage from './IapBankHookHistoryPage'
import IapPaymentTransactionDetailPanel from './IapPaymentTransactionDetailPanel'
import IapPaymentTransactionsDialog from './IapPaymentTransactionsDialog'
import IapRefundPendingDialog from './IapRefundPendingDialog'

const SECTIONS = [
  { key: 'transactions', label: 'Transactions', meta: 'Payment tickets and failure states', icon: CreditCard },
  { key: 'beneficiaries', label: 'Beneficiaries', meta: 'Current receiver accounts', icon: Landmark },
  { key: 'refunds', label: 'Refund pending', meta: 'Transfers needing manual review', icon: RotateCcw },
  { key: 'history', label: 'History', meta: 'Bank hook transaction log', icon: History },
]

function getPaymentToolPath(sectionKey) {
  return `/admin/iap/payment-tools/${sectionKey}`
}

function getPaymentTransactionDetailPath(transactionId) {
  return `/admin/iap/payment-tools/transactions/${encodeURIComponent(transactionId)}`
}

function renderSection(sectionKey, paymentTransactionId, onNavigate) {
  if (sectionKey === 'beneficiaries') {
    return <IapBeneficiaryAccountsDialog />
  }
  if (sectionKey === 'refunds') {
    return <IapRefundPendingDialog />
  }
  if (sectionKey === 'history') {
    return <IapBankHookHistoryPage embedded onNavigate={onNavigate} />
  }
  if (paymentTransactionId) {
    return (
      <IapPaymentTransactionDetailPanel
        onBack={() => onNavigate?.(getPaymentToolPath('transactions'))}
        transactionId={paymentTransactionId}
      />
    )
  }
  return <IapPaymentTransactionsDialog onTransactionSelect={(transactionId) => onNavigate?.(getPaymentTransactionDetailPath(transactionId))} />
}

export default function IapPaymentOperationsPanel({ activeSection = 'transactions', onNavigate, paymentTransactionId }) {
  const currentSection = SECTIONS.find((section) => section.key === activeSection) || SECTIONS[0]

  return (
    <div className="iap-tab-panel dev-host">
      <DeveloperMarker code="admin.react.manage.iap.payment-tools" title="Admin React IAP Payment Tools" />
      <div className="iap-operations-layout">
        <aside className="panel iap-operations-nav dev-host">
          <DeveloperMarker code="admin.react.manage.iap.payment-tools.nav" title="Admin React IAP Payment Tools Navigation" />
          <div className="iap-operations-button-list">
            {SECTIONS.map((section) => {
              const Icon = section.icon
              const isActive = section.key === currentSection.key
              return (
                <button
                  key={section.key}
                  type="button"
                  className={`iap-operations-nav-button${isActive ? ' iap-operations-nav-button-active' : ''}`}
                  onClick={() => onNavigate?.(getPaymentToolPath(section.key))}
                >
                  <Icon size={18} />
                  <span>
                    <strong>{section.label}</strong>
                    <small>{section.meta}</small>
                  </span>
                </button>
              )
            })}
          </div>
        </aside>

        <div className="iap-operations-content dev-host">
          <DeveloperMarker code={`admin.react.manage.iap.payment-tools.${currentSection.key}`} title="Admin React IAP Payment Tools Content" />
          {renderSection(currentSection.key, paymentTransactionId, onNavigate)}
        </div>
      </div>
    </div>
  )
}