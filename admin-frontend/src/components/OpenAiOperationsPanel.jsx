import { ArrowLeftRight, FileClock, FlaskConical, KeyRound, Settings } from 'lucide-react'
import DeveloperMarker from './DeveloperMarker'
import OpenAiConfigPanel from './OpenAiConfigPanel'
import OpenAiRequestsPanel from './OpenAiRequestsPanel'
import OpenAiTokenUsagePanel from './OpenAiTokenUsagePanel'
import OpenAiTestPanel from './OpenAiTestPanel'
import OpenAiTokensPanel from './OpenAiTokensPanel'

const SECTIONS = [
  { key: 'tokens', label: 'Token list', meta: 'Credential pool', icon: KeyRound, markerCode: 'admin.react.service.openai.nav.tokens' },
  { key: 'requests', label: 'Requests', meta: 'Translation jobs', icon: FileClock, markerCode: 'admin.react.service.openai.nav.requests' },
  { key: 'usage', label: 'Token usage', meta: 'Input output totals', icon: ArrowLeftRight, markerCode: 'admin.react.service.openai.nav.usage' },
  { key: 'test', label: 'Test', meta: 'Upload one .srt', icon: FlaskConical, markerCode: 'admin.react.service.openai.nav.test' },
  { key: 'config', label: 'Config', meta: 'Prompt and model', icon: Settings, markerCode: 'admin.react.service.openai.nav.config' },
]

function getOpenAiSectionPath(sectionKey) {
  return `/admin/service/openai/${sectionKey}`
}

function renderSection(sectionKey, onNavigate, requestId) {
  if (sectionKey === 'requests') return <OpenAiRequestsPanel onNavigate={onNavigate} requestId={requestId} />
  if (sectionKey === 'usage') return <OpenAiTokenUsagePanel onNavigate={onNavigate} />
  if (sectionKey === 'test') return <OpenAiTestPanel />
  if (sectionKey === 'config') return <OpenAiConfigPanel />
  return <OpenAiTokensPanel />
}

export default function OpenAiOperationsPanel({ activeSection = 'tokens', onNavigate, requestId = '' }) {
  const currentSection = SECTIONS.find((section) => section.key === activeSection) || SECTIONS[0]

  return (
    <div className="iap-tab-panel dev-host">
      <DeveloperMarker code="admin.react.service.openai" title="Admin React Service OpenAI" />
      <div className="iap-operations-layout">
        <aside className="panel iap-operations-nav dev-host">
          <DeveloperMarker code="admin.react.service.openai.nav" title="Admin React Service OpenAI Navigation" />
          <div className="iap-operations-button-list">
            {SECTIONS.map((section) => {
              const Icon = section.icon
              const isActive = section.key === currentSection.key
              return (
                <div key={section.key} className="dev-host openai-nav-button-host">
                  <DeveloperMarker code={section.markerCode} title={`Admin React Service OpenAI ${section.label} Tab`} />
                  <button type="button" className={`iap-operations-nav-button${isActive ? ' iap-operations-nav-button-active' : ''}`} onClick={() => onNavigate?.(getOpenAiSectionPath(section.key))}>
                    <Icon size={18} />
                    <span><strong>{section.label}</strong><small>{section.meta}</small></span>
                  </button>
                </div>
              )
            })}
          </div>
        </aside>
        <div className="iap-operations-content dev-host">
          <DeveloperMarker code={`admin.react.service.openai.${currentSection.key}`} title="Admin React Service OpenAI Content" />
          {renderSection(currentSection.key, onNavigate, requestId)}
        </div>
      </div>
    </div>
  )
}