import DeveloperMarker from './DeveloperMarker'

export default function WhisperConfigPanel() {
  return (
    <div className="dev-host">
      <DeveloperMarker code="admin.react.service.whisper.config" title="Admin React Service Whisper Config" />
      <div className="empty-state">Whisper configuration is not yet available.</div>
    </div>
  )
}
