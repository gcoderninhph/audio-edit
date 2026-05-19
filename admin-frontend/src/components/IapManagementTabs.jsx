import { BadgePercent, KeyRound, Package, Settings2 } from 'lucide-react'
import { useState } from 'react'
import DeveloperMarker from './DeveloperMarker'
import IapApiKeyPanel from './IapApiKeyPanel'
import IapPackFunctionPanel from './IapPackFunctionPanel'
import IapPackagesPanel from './IapPackagesPanel'
import IapSalesPanel from './IapSalesPanel'

const TABS = [
  { key: 'packages', label: 'IAP package', meta: 'Catalog', icon: Package },
  { key: 'api-key', label: 'API key', meta: 'Bank hook', icon: KeyRound },
  { key: 'pack-function', label: 'Pack function', meta: 'Rewards', icon: Settings2 },
  { key: 'sale', label: 'Sale', meta: 'Promotions', icon: BadgePercent },
]

export default function IapManagementTabs({ onHeaderActionsChange }) {
  const [activeTab, setActiveTab] = useState('packages')

  return (
    <section className="panel iap-tabs-shell dev-host">
      <DeveloperMarker code="admin.react.manage.iap" title="Admin React IAP" />
      <div className="iap-tabs" role="tablist" aria-label="IAP admin sections">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button key={tab.key} type="button" role="tab" aria-selected={isActive} className={`iap-tab${isActive ? ' iap-tab-active' : ''}`} onClick={() => setActiveTab(tab.key)}>
              <Icon size={18} />
              <span><strong>{tab.label}</strong><small>{tab.meta}</small></span>
            </button>
          )
        })}
      </div>
      <div className="iap-tab-content">
        {activeTab === 'packages' && <IapPackagesPanel onHeaderActionsChange={onHeaderActionsChange} />}
        {activeTab === 'api-key' && <IapApiKeyPanel onHeaderActionsChange={onHeaderActionsChange} />}
        {activeTab === 'pack-function' && <IapPackFunctionPanel onHeaderActionsChange={onHeaderActionsChange} />}
        {activeTab === 'sale' && <IapSalesPanel onHeaderActionsChange={onHeaderActionsChange} />}
      </div>
    </section>
  )
}