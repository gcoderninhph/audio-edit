import { FileClock, KeyRound, Settings } from 'lucide-react'
import DeveloperMarker from './DeveloperMarker'
import VbeeConfigPanel from './VbeeConfigPanel'
import VbeeRequestsPanel from './VbeeRequestsPanel'
import VbeeTokensPanel from './VbeeTokensPanel'

const SECTIONS = [
  { key: 'tokens', label: 'Token list', meta: 'Credential pool', icon: KeyRound },
  { key: 'requests', label: 'Request', meta: 'Queue and webhook state', icon: FileClock },
  { key: 'config', label: 'Config', meta: 'Provider defaults', icon: Settings },
]

function getVbeeSectionPath(sectionKey) {
  return `/admin/service/vbee/${sectionKey}`
}

function renderSection(sectionKey, requestId, onNavigate) {
  if (sectionKey === 'requests') {
    return <VbeeRequestsPanel onNavigate={onNavigate} requestId={requestId} />
  }
  if (sectionKey === 'config') {
    return <VbeeConfigPanel />
  }
  return <VbeeTokensPanel />
}

export default function VbeeOperationsPanel({ activeSection = 'tokens', onNavigate, requestId }) {
  const currentSection = SECTIONS.find((section) => section.key === activeSection) || SECTIONS[0]

  return (
    <div className="iap-tab-panel dev-host">
      <DeveloperMarker code="admin.react.service.vbee" title="Admin React Service Vbee" />
      <div className="iap-operations-layout">
        <aside className="panel iap-operations-nav dev-host">
          <DeveloperMarker code="admin.react.service.vbee.nav" title="Admin React Service Vbee Navigation" />
          <div className="iap-operations-button-list">
            {SECTIONS.map((section) => {
              const Icon = section.icon
              const isActive = section.key === currentSection.key
              return (
                <button key={section.key} type="button" className={`iap-operations-nav-button${isActive ? ' iap-operations-nav-button-active' : ''}`} onClick={() => onNavigate?.(getVbeeSectionPath(section.key))}>
                  <Icon size={18} />
                  <span><strong>{section.label}</strong><small>{section.meta}</small></span>
                </button>
              )
            })}
          </div>
        </aside>
        <div className="iap-operations-content dev-host">
          <DeveloperMarker code={`admin.react.service.vbee.${currentSection.key}`} title="Admin React Service Vbee Content" />
          {renderSection(currentSection.key, requestId, onNavigate)}
        </div>
      </div>
    </div>
  )
}