import DeveloperMarker from './DeveloperMarker'
import IapManagementTabs from './IapManagementTabs'

export default function IapPage({ onHeaderActionsChange, onNavigate, route }) {
  return (
    <div className="page-stack dev-host">
      <DeveloperMarker code="admin.react.iap.page" title="Admin React IAP Page" />
      <IapManagementTabs onHeaderActionsChange={onHeaderActionsChange} onNavigate={onNavigate} route={route} />
    </div>
  )
}