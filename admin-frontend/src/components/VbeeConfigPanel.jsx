import { RefreshCw, Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAdminVbeeConfig, updateAdminVbeeConfig } from '../api/adminVbeeApi'
import DeveloperMarker from './DeveloperMarker'

const EMPTY_LIST = []

export default function VbeeConfigPanel() {
  const [config, setConfig] = useState({ apiBaseUrl: '', audioType: 'wav', defaultLanguage: 'vi', defaultVoiceCode: '', enabledLanguageCodes: [], supportedLanguages: [], webhookHost: '', webhookPath: '/api/vbee/webhook', webhookSecret: '', webhookUrl: '' })
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const supportedLanguages = Array.isArray(config.supportedLanguages) ? config.supportedLanguages : EMPTY_LIST
  const supportedLanguageCodes = useMemo(() => supportedLanguages.map((language) => language.code), [supportedLanguages])
  const enabledLanguageCodes = Array.isArray(config.enabledLanguageCodes) ? config.enabledLanguageCodes : EMPTY_LIST
  const enabledLanguageSet = useMemo(() => new Set(enabledLanguageCodes), [enabledLanguageCodes])

  const loadConfig = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminVbeeConfig()
      setConfig((current) => ({ ...current, ...(payload.config || {}) }))
    } catch (loadError) {
      setError(loadError.message || 'Unable to load Vbee config.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  const updateEnabledLanguageCodes = useCallback((nextCodes) => {
    const nextCodeSet = new Set((nextCodes || []).map((code) => String(code || '').trim()).filter(Boolean))
    setConfig((current) => ({
      ...current,
      enabledLanguageCodes: supportedLanguageCodes.filter((code) => nextCodeSet.has(code)),
    }))
  }, [supportedLanguageCodes])

  const handleLanguageToggle = useCallback((languageCode) => {
    if (enabledLanguageSet.has(languageCode)) {
      updateEnabledLanguageCodes(enabledLanguageCodes.filter((code) => code !== languageCode))
      return
    }
    updateEnabledLanguageCodes([...enabledLanguageCodes, languageCode])
  }, [enabledLanguageCodes, enabledLanguageSet, updateEnabledLanguageCodes])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    try {
      const payload = await updateAdminVbeeConfig(config)
      setConfig((current) => ({ ...current, ...(payload.config || {}) }))
    } catch (saveError) {
      setError(saveError.message || 'Unable to update Vbee config.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.service.vbee.config" title="Admin React Vbee Config" />
      <form onSubmit={handleSubmit}>
        <div className="section-toolbar">
          <div className="section-heading compact"><p>Vbee</p><h2>Config</h2></div>
          <div className="toolbar-actions">
            <button type="button" className="ghost-button compact" onClick={() => void loadConfig()} disabled={isLoading || isSaving}><RefreshCw size={17} /> Refresh</button>
            <button type="submit" className="primary-button compact" disabled={isLoading || isSaving}><Save size={17} /> {isSaving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
        {error && <div className="notice notice-error">{error}</div>}
        <div className="package-form-grid">
          <label className="field"><span>API base URL</span><input value={config.apiBaseUrl} onChange={(event) => setConfig((current) => ({ ...current, apiBaseUrl: event.target.value }))} /></label>
          <label className="field"><span>Audio type</span><select value={config.audioType} onChange={(event) => setConfig((current) => ({ ...current, audioType: event.target.value }))}><option value="wav">wav</option><option value="mp3">mp3</option></select></label>
          <label className="field"><span>Default language</span><input value={config.defaultLanguage} onChange={(event) => setConfig((current) => ({ ...current, defaultLanguage: event.target.value }))} /></label>
          <label className="field"><span>Default voice</span><input value={config.defaultVoiceCode} onChange={(event) => setConfig((current) => ({ ...current, defaultVoiceCode: event.target.value }))} /></label>
          <label className="field"><span>Webhook host</span><input value={config.webhookHost || ''} placeholder="https://audio-test.accstore.pro.vn" onChange={(event) => setConfig((current) => ({ ...current, webhookHost: event.target.value }))} /></label>
          <label className="field"><span>Webhook path</span><input value={config.webhookPath || '/api/vbee/webhook'} readOnly /></label>
          <div className="field vbee-language-config-field">
            <span>Enabled voiceover languages</span>
            <div className="subtitle-tool-note">
              Desktop voiceover buttons use this list to enable or disable narration for each translated display language.
            </div>
            <div className="vbee-language-config-toolbar">
              <div className="button-group">
                <button type="button" className="ghost-button compact" onClick={() => updateEnabledLanguageCodes(supportedLanguageCodes)} disabled={!supportedLanguages.length || isLoading || isSaving}>Enable all</button>
                <button type="button" className="ghost-button compact" onClick={() => updateEnabledLanguageCodes([])} disabled={!supportedLanguages.length || isLoading || isSaving}>Disable all</button>
              </div>
              <span className="vbee-language-config-count">{enabledLanguageCodes.length}/{supportedLanguages.length || 0} enabled</span>
            </div>
            <div className="vbee-language-checkbox-grid">
              {supportedLanguages.map((language) => (
                <label key={language.code} className="vbee-language-checkbox">
                  <input
                    type="checkbox"
                    checked={enabledLanguageSet.has(language.code)}
                    onChange={() => handleLanguageToggle(language.code)}
                    disabled={isLoading || isSaving}
                  />
                  <span>{language.label}</span>
                  <small>{language.code}</small>
                </label>
              ))}
              {!supportedLanguages.length && <div className="empty-cell">No supported Vbee languages were returned.</div>}
            </div>
          </div>
        </div>
      </form>
    </section>
  )
}