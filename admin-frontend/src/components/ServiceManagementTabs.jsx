import { Bot, Waves } from 'lucide-react'
import DeveloperMarker from './DeveloperMarker'
import OpenAiOperationsPanel from './OpenAiOperationsPanel'
import VbeeOperationsPanel from './VbeeOperationsPanel'

const TABS = [
  { key: 'openai', label: 'OpenAI', meta: 'Subtitle translation', icon: Bot },
  { key: 'vbee', label: 'Vbee', meta: 'Voiceover', icon: Waves },
]

function getServiceTabPath(tabKey) {
  if (tabKey === 'openai') return '/admin/service/openai/tokens'
  if (tabKey === 'vbee') return '/admin/service/vbee/tokens'
  return `/admin/service/${tabKey}`
}

export default function ServiceManagementTabs({ onNavigate, route }) {
  const activeTab = route?.serviceTab || 'vbee'

  return (
    <section className="panel iap-tabs-shell dev-host">
      <DeveloperMarker code="admin.react.service" title="Admin React Service" />
      <div className="iap-tabs" role="tablist" aria-label="Service admin sections">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button key={tab.key} type="button" role="tab" aria-selected={isActive} className={`iap-tab${isActive ? ' iap-tab-active' : ''}`} onClick={() => onNavigate?.(getServiceTabPath(tab.key))}>
              <Icon size={18} />
              <span><strong>{tab.label}</strong><small>{tab.meta}</small></span>
            </button>
          )
        })}
      </div>
      <div className="iap-tab-content">
        {activeTab === 'openai' && <OpenAiOperationsPanel activeSection={route?.openAiSection} onNavigate={onNavigate} />}
        {activeTab === 'vbee' && <VbeeOperationsPanel activeSection={route?.vbeeSection} onNavigate={onNavigate} requestId={route?.vbeeRequestId} segmentHash={route?.vbeeSegmentHash} />}
      </div>
    </section>
  )
}