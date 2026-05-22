import { Eye, RefreshCw, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAdminOpenAiConfig, runAdminOpenAiTestTranslation } from '../api/adminOpenAiApi'
import DeveloperMarker from './DeveloperMarker'

const LANGUAGE_OPTIONS = [
  { value: 'Vietnamese', label: 'Vietnamese' },
  { value: 'English', label: 'English' },
  { value: 'Japanese', label: 'Japanese' },
  { value: 'Korean', label: 'Korean' },
  { value: 'Chinese (Simplified)', label: 'Chinese (Simplified)' },
  { value: 'Thai', label: 'Thai' },
  { value: 'Indonesian', label: 'Indonesian' },
  { value: 'French', label: 'French' },
  { value: 'German', label: 'German' },
  { value: 'Spanish', label: 'Spanish' },
]

export default function OpenAiTestPanel() {
  const [error, setError] = useState('')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [previewSections, setPreviewSections] = useState({ curl: '', systemPrompt: '', userPrompt: '' })
  const [result, setResult] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [targetLanguage, setTargetLanguage] = useState(LANGUAGE_OPTIONS[0].value)
  const [config, setConfig] = useState(null)
  const fileInputId = 'openai-test-srt-upload'
  const defaultConfig = useMemo(() => ({
    apiBaseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.4-mini',
    promptTemplate: 'Translate this subtitle file into <TARGET_LANGUAGE>. Return only valid SRT content.\n\n<SRT_FILE_CONTENT>',
    systemPrompt: 'You translate subtitle files. Return only valid SRT content.',
  }), [])

  const sourceFileLabel = useMemo(() => selectedFile?.name || 'No .srt file selected yet.', [selectedFile])

  const buildPromptPreview = useCallback(async (overrideConfig) => {
    if (!selectedFile) {
      throw new Error('Please choose an .srt file before previewing the prompt.')
    }
    const activeConfig = overrideConfig || config || defaultConfig
    const fileText = await selectedFile.text()
    const promptTemplate = String(activeConfig.promptTemplate || defaultConfig.promptTemplate).trim() || defaultConfig.promptTemplate
    let promptBody = promptTemplate.replaceAll('<TARGET_LANGUAGE>', targetLanguage)
    if (promptBody.includes('<SRT_FILE_CONTENT>')) {
      promptBody = promptBody.replace('<SRT_FILE_CONTENT>', fileText)
    } else {
      promptBody = `${promptBody}\n\n<SRT_FILE_CONTENT>\n${fileText}`
    }
    const apiBaseUrl = String(activeConfig.apiBaseUrl || defaultConfig.apiBaseUrl).trim().replace(/\/$/, '') || defaultConfig.apiBaseUrl
    const systemPrompt = String(activeConfig.systemPrompt || defaultConfig.systemPrompt).trim()
    const model = String(activeConfig.model || defaultConfig.model).trim()
    const temperature = Number(activeConfig.temperature ?? 0.2)
    const requestBody = {
      model,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: promptBody },
      ],
    }
    return {
      curl: [
        `curl -X POST "${apiBaseUrl}/chat/completions" ^`,
        `  -H "Authorization: Bearer YOUR_OPENAI_API_KEY" ^`,
        `  -H "Content-Type: application/json" ^`,
        `  -d '${JSON.stringify(requestBody, null, 2).replaceAll("'", "\\'")}'`,
      ].join('\n'),
      systemPrompt,
      userPrompt: promptBody,
    }
  }, [config, defaultConfig, selectedFile, targetLanguage])

  const handlePreviewPrompt = async () => {
    setError('')
    setIsPreviewLoading(true)
    try {
      const payload = config ? { config } : await fetchAdminOpenAiConfig()
      const activeConfig = payload.config || null
      if (!config) setConfig(activeConfig)
      setPreviewSections(await buildPromptPreview(activeConfig))
      setIsPreviewOpen(true)
    } catch (previewError) {
      setError(previewError.message || 'Unable to preview OpenAI prompt.')
    } finally {
      setIsPreviewLoading(false)
    }
  }

  const closePreview = () => setIsPreviewOpen(false)

  useEffect(() => {
    let isActive = true
    void fetchAdminOpenAiConfig()
      .then((payload) => {
        if (isActive) setConfig(payload.config || null)
      })
      .catch(() => {
        if (isActive) setConfig(null)
      })
    return () => {
      isActive = false
    }
  }, [])

  const handleReset = () => {
    setError('')
    setResult(null)
    setSelectedFile(null)
    setTargetLanguage(LANGUAGE_OPTIONS[0].value)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!selectedFile) {
      setError('Please choose an .srt file to test.')
      return
    }
    setIsRunning(true)
    setError('')
    try {
      const payload = await runAdminOpenAiTestTranslation({ file: selectedFile, targetLanguage })
      setResult(payload.result || null)
    } catch (runError) {
      setResult(null)
      setError(runError.message || 'Unable to run OpenAI test translation.')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.service.openai.test" title="Admin React OpenAI Test" />
      <form onSubmit={handleSubmit} className="page-stack dev-host">
        <DeveloperMarker code="admin.react.service.openai.test.form" title="Admin React OpenAI Test Form" />
        <div className="section-toolbar">
          <div className="section-heading compact"><p>OpenAI</p><h2>Test translation</h2></div>
          <div className="toolbar-actions">
            <button type="button" className="ghost-button compact" onClick={handleReset} disabled={isRunning}><RefreshCw size={17} /> Reset</button>
            <button type="submit" className="primary-button compact" disabled={isRunning}><Upload size={17} /> {isRunning ? 'Testing...' : 'Upload and test'}</button>
          </div>
        </div>

        <div className="notice notice-info">Upload one `.srt` file, choose the target language, and run a direct OpenAI test without creating a long-lived translation job.</div>
        {error && <div className="notice notice-error">{error}</div>}

        <div className="package-form-grid openai-test-grid">
          <label className="openai-test-upload-tile" htmlFor={fileInputId} aria-label="Choose .srt file to upload">
            <input id={fileInputId} type="file" accept=".srt" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} />
            <Upload size={24} />
          </label>
          <label className="field openai-test-language-field">
            <span>Target language</span>
            <select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>
              {LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <div className="panel openai-test-summary-card dev-host package-description-field">
            <DeveloperMarker code="admin.react.service.openai.test.summary" title="Admin React OpenAI Test Summary" />
            <div className="detail-summary-grid openai-test-summary-grid">
              <div><span>Source file</span><strong>{sourceFileLabel}</strong></div>
              <div><span>Target language</span><strong>{targetLanguage}</strong></div>
              <div><span>Status</span><strong>{isRunning ? 'Running' : result ? 'Complete' : 'Ready'}</strong></div>
              <div><span>Provider</span><strong>{result?.provider || 'openai-chatgpt'}</strong></div>
            </div>
          </div>
        </div>

        <div className="panel openai-test-result-panel dev-host">
          <button type="button" className="icon-button openai-test-result-preview-button" onClick={() => void handlePreviewPrompt()} disabled={isRunning || isPreviewLoading || !selectedFile} title="Preview prompt" aria-label="Preview prompt">
            <Eye size={16} />
          </button>
          <DeveloperMarker code="admin.react.service.openai.test.result" title="Admin React OpenAI Test Result" />
          <div className="section-heading compact">
            <p>OpenAI</p>
            <h2>Translated subtitle result</h2>
          </div>
          {result && (
            <div className="detail-summary-grid openai-test-summary-grid">
              <div><span>Model</span><strong>{result.model || '-'}</strong></div>
              <div><span>Token</span><strong>{result.tokenName || '-'}</strong></div>
              <div><span>Subtitle blocks</span><strong>{result.subtitleCount || 0}</strong></div>
              <div><span>Timeout</span><strong>{result.timeoutSeconds || 0}s</strong></div>
            </div>
          )}
          <label className="field openai-test-result-field">
            <span>Result content</span>
            <textarea readOnly value={result?.translatedContent || ''} placeholder="Translated SRT content will appear here after the OpenAI test finishes." />
          </label>
        </div>

        {isPreviewOpen && (
          <div className="dialog-backdrop" role="presentation" onClick={closePreview}>
            <div className="panel openai-prompt-preview-dialog dev-host" role="dialog" aria-modal="true" aria-label="OpenAI prompt preview" onClick={(event) => event.stopPropagation()}>
              <DeveloperMarker code="admin.react.service.openai.test.preview" title="Admin React OpenAI Prompt Preview" />
              <div className="section-toolbar">
                <div className="section-heading compact"><p>OpenAI</p><h2>Prompt preview</h2></div>
                <button type="button" className="ghost-button compact" onClick={closePreview}><X size={16} /> Close</button>
              </div>
              <div className="notice notice-info">This preview is split into the exact request cURL, the system prompt, and the user prompt for the current file and target language.</div>
              <div className="openai-prompt-preview-grid">
                <label className="field openai-test-result-field openai-prompt-preview-box">
                  <span>curl sẽ gửi</span>
                  <textarea readOnly value={previewSections.curl || 'Loading cURL preview...'} />
                </label>
                <label className="field openai-test-result-field openai-prompt-preview-box">
                  <span>system prompt</span>
                  <textarea readOnly value={previewSections.systemPrompt || 'Loading system prompt...'} />
                </label>
                <label className="field openai-test-result-field openai-prompt-preview-box">
                  <span>user prompt</span>
                  <textarea readOnly value={previewSections.userPrompt || 'Loading user prompt...'} />
                </label>
              </div>
            </div>
          </div>
        )}
      </form>
    </section>
  )
}