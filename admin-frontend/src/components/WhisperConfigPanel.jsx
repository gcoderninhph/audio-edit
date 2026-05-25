import { RefreshCw, Save } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { fetchAdminWhisperConfig, updateAdminWhisperConfig } from '../api/adminWhisperApi'
import DeveloperMarker from './DeveloperMarker'

const DEFAULT_CONFIG = {
  detectCreditPerMinute: 20,
}

export default function WhisperConfigPanel() {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const loadConfig = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminWhisperConfig()
      setConfig((current) => ({ ...current, ...(payload.config || {}) }))
    } catch (loadError) {
      setError(loadError.message || 'Unable to load Whisper config.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    try {
      const payload = await updateAdminWhisperConfig(config)
      setConfig((current) => ({ ...current, ...(payload.config || {}) }))
    } catch (saveError) {
      setError(saveError.message || 'Unable to update Whisper config.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.service.whisper.config" title="Admin React Service Whisper Config" />
      <form onSubmit={handleSubmit}>
        <div className="section-toolbar">
          <div className="section-heading compact"><p>Whisper</p><h2>Config</h2></div>
          <div className="toolbar-actions">
            <button type="button" className="ghost-button compact" onClick={() => void loadConfig()} disabled={isLoading || isSaving}><RefreshCw size={17} /> Refresh</button>
            <button type="submit" className="primary-button compact" disabled={isLoading || isSaving}><Save size={17} /> {isSaving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>

        {error && <div className="notice notice-error">{error}</div>}

        <div className="package-form-grid">
          <label className="field"><span>Detect credit per minute</span><input type="number" min="0" max="100000" step="0.01" value={config.detectCreditPerMinute} onChange={(event) => setConfig((current) => ({ ...current, detectCreditPerMinute: Number(event.target.value) || 0 }))} /></label>
        </div>
      </form>
    </section>
  )
}
