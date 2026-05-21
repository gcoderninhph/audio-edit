import ServiceManagementTabs from './ServiceManagementTabs'

export default function ServicePage({ onHeaderActionsChange, onNavigate, route }) {
  return <ServiceManagementTabs onHeaderActionsChange={onHeaderActionsChange} onNavigate={onNavigate} route={route} />
}