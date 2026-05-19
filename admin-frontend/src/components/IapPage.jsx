import DeveloperMarker from './DeveloperMarker'
import IapManagementTabs from './IapManagementTabs'

export default function IapPage({ onHeaderActionsChange }) {
  return (
    <div className="page-stack dev-host">
      <DeveloperMarker code="admin.react.iap.page" title="Admin React IAP Page" />
      <IapManagementTabs onHeaderActionsChange={onHeaderActionsChange} />
    </div>
  )
}