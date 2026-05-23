import { FileClock, Server, Settings } from 'lucide-react'
import DeveloperMarker from './DeveloperMarker'
import WhisperConfigPanel from './WhisperConfigPanel'
import WhisperNodesPanel from './WhisperNodesPanel'
import WhisperRequestsPanel from './WhisperRequestsPanel'

const SECTIONS = [
  { key: 'requests', label: 'Requests', meta: 'Transcription jobs', icon: FileClock, markerCode: 'admin.react.service.whisper.nav.requests' },
  { key: 'nodes', label: 'Nodes', meta: 'Processing nodes', icon: Server, markerCode: 'admin.react.service.whisper.nav.nodes' },
  { key: 'config', label: 'Config', meta: 'Provider settings', icon: Settings, markerCode: 'admin.react.service.whisper.nav.config' },
]

function getWhisperSectionPath(sectionKey) {
  return `/admin/service/whisper/${sectionKey}`
}

function renderSection(sectionKey) {
  if (sectionKey === 'nodes') return <WhisperNodesPanel />
  if (sectionKey === 'config') return <WhisperConfigPanel />
  return <WhisperRequestsPanel />
}

export default function WhisperOperationsPanel({ activeSection = 'requests', onNavigate }) {
  const currentSection = SECTIONS.find((section) => section.key === activeSection) || SECTIONS[0]

  return (
    <div className="iap-tab-panel dev-host">
      <DeveloperMarker code="admin.react.service.whisper" title="Admin React Service Whisper" />
      <div className="iap-operations-layout">
        <aside className="panel iap-operations-nav dev-host">
          <DeveloperMarker code="admin.react.service.whisper.nav" title="Admin React Service Whisper Navigation" />
          <div className="iap-operations-button-list">
            {SECTIONS.map((section) => {
              const Icon = section.icon
              const isActive = section.key === currentSection.key
              return (
                <div key={section.key} className="dev-host whisper-nav-button-host">
                  <DeveloperMarker code={section.markerCode} title={`Admin React Service Whisper ${section.label} Tab`} />
                  <button type="button" className={`iap-operations-nav-button${isActive ? ' iap-operations-nav-button-active' : ''}`} onClick={() => onNavigate?.(getWhisperSectionPath(section.key))}>
                    <Icon size={18} />
                    <span><strong>{section.label}</strong><small>{section.meta}</small></span>
                  </button>
                </div>
              )
            })}
          </div>
        </aside>
        <div className="iap-operations-content dev-host">
          <DeveloperMarker code={`admin.react.service.whisper.${currentSection.key}`} title="Admin React Service Whisper Content" />
          {renderSection(currentSection.key)}
        </div>
      </div>
    </div>
  )
}
