import { RefreshCw, Save } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { fetchAdminOpenAiConfig, updateAdminOpenAiConfig } from '../api/adminOpenAiApi'
import DeveloperMarker from './DeveloperMarker'

const DEFAULT_CONFIG = {
  apiBaseUrl: 'https://api.openai.com/v1',
  model: 'gpt-5.4-mini',
  promptTemplate: 'Translate this subtitle file into <TARGET_LANGUAGE>. Return only valid SRT content.\n\n<SRT_FILE_CONTENT>',
  systemPrompt: 'You translate subtitle files. Return only valid SRT content.',
  temperature: 0.2,
  timeoutSeconds: 120,
}

const MODEL_OPTIONS = [
  { value: 'gpt-5.5', label: 'GPT-5.5' },
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
]

export default function OpenAiConfigPanel() {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const modelOptions = config.model && !MODEL_OPTIONS.some((option) => option.value === config.model)
    ? [{ value: config.model, label: `${config.model} (current)` }, ...MODEL_OPTIONS]
    : MODEL_OPTIONS

  const loadConfig = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminOpenAiConfig()
      setConfig((current) => ({ ...current, ...(payload.config || {}) }))
    } catch (loadError) {
      setError(loadError.message || 'Unable to load OpenAI config.')
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
      const payload = await updateAdminOpenAiConfig(config)
      setConfig((current) => ({ ...current, ...(payload.config || {}) }))
    } catch (saveError) {
      setError(saveError.message || 'Unable to update OpenAI config.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.service.openai.config" title="Admin React OpenAI Config" />
      <form onSubmit={handleSubmit}>
        <div className="section-toolbar">
          <div className="section-heading compact"><p>OpenAI</p><h2>Config</h2></div>
          <div className="toolbar-actions">
            <button type="button" className="ghost-button compact" onClick={() => void loadConfig()} disabled={isLoading || isSaving}><RefreshCw size={17} /> Refresh</button>
            <button type="submit" className="primary-button compact" disabled={isLoading || isSaving}><Save size={17} /> {isSaving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>

        <div className="notice notice-info openai-config-template-note">Use <strong>&lt;SRT_FILE_CONTENT&gt;</strong> inside the prompt template to inject the subtitle text. The backend also supports <strong>&lt;TARGET_LANGUAGE&gt;</strong>.</div>
        {error && <div className="notice notice-error">{error}</div>}

        <div className="package-form-grid">
          <label className="field"><span>API base URL</span><input value={config.apiBaseUrl} onChange={(event) => setConfig((current) => ({ ...current, apiBaseUrl: event.target.value }))} /></label>
          <label className="field">
            <span>Model</span>
            <select value={config.model} onChange={(event) => setConfig((current) => ({ ...current, model: event.target.value }))}>
              {modelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Temperature</span><input type="number" min="0" max="2" step="0.1" value={config.temperature} onChange={(event) => setConfig((current) => ({ ...current, temperature: Number(event.target.value) || 0 }))} /></label>
          <label className="field"><span>Timeout seconds</span><input type="number" min="10" max="600" step="1" value={config.timeoutSeconds} onChange={(event) => setConfig((current) => ({ ...current, timeoutSeconds: Number(event.target.value) || 120 }))} /></label>
          <label className="field package-description-field"><span>System prompt</span><textarea value={config.systemPrompt} onChange={(event) => setConfig((current) => ({ ...current, systemPrompt: event.target.value }))} /></label>
          <label className="field package-description-field"><span>Prompt template</span><textarea value={config.promptTemplate} onChange={(event) => setConfig((current) => ({ ...current, promptTemplate: event.target.value }))} /></label>
        </div>
      </form>
    </section>
  )
}