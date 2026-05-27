# MAP.admin_web.iap

## admin IAP routing and tabs
- `admin-frontend/src/components/IapPage.jsx` - Wraps the dedicated admin IAP route and passes route state into the IAP shell.
- `admin-frontend/src/components/IapManagementTabs.jsx` - Renders the top-level admin IAP tab strip.

## admin IAP package and rule management
- `admin-frontend/src/components/IapPackagesPanel.jsx` - Renders IAP package CRUD and package-level actions.
- `admin-frontend/src/components/IapPackageFunctionDialog.jsx` - Renders the pack-function dialog for credits and premium behavior.
- `admin-frontend/src/components/IapSalesPanel.jsx` - Renders sale-rule creation, list, and delete flows.
- `admin-frontend/src/utils/iapPackages.js` - Stores package-type constants, labels, and derived summaries for the IAP UI.

## admin IAP payment operations
- `admin-frontend/src/components/IapApiKeyPanel.jsx` - Manages payment-hook API keys for inbound payment hooks.
- `admin-frontend/src/components/IapPaymentOperationsPanel.jsx` - Renders the split payment-tools layout and embedded detail routing.
- `admin-frontend/src/components/IapBeneficiaryAccountsDialog.jsx` - Renders beneficiary account list and create/edit dialog flows.
- `admin-frontend/src/components/IapBeneficiaryAccountDetailPanel.jsx` - Renders beneficiary account detail and replacement view behavior.
- `admin-frontend/src/components/IapPaymentTransactionsDialog.jsx` - Renders the payment transaction list and row navigation flow.
- `admin-frontend/src/components/IapPaymentTransactionDetailPanel.jsx` - Renders payment transaction detail content.
- `admin-frontend/src/components/IapRefundPendingDialog.jsx` - Renders the refund-pending review list and detail entrypoints.
- `admin-frontend/src/components/IapRefundPendingDetailPanel.jsx` - Renders refund-pending detail content.
- `admin-frontend/src/components/IapBankHookHistoryPage.jsx` - Renders the searchable bank-hook history list and embedded history surface.
- `admin-frontend/src/components/IapBankHookHistoryDetailPage.jsx` - Renders bank-hook history detail and raw payload inspection.
- `admin-frontend/src/styles/iap.css` - Styles the tabbed IAP shell, payment split layout, and detail views.
