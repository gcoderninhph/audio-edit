import { Check, Copy, History, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createAdminIapApiKey, deleteAdminIapApiKey, fetchAdminIapApiKeys } from '../api/adminApi'
import { formatDateTime } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'

const DEFAULT_FORM_STATE = {
  headerFormat: '<API_KEY>',
  headerName: 'X-Api-Key',
  method: 'POST',
  name: '',
}

export default function IapApiKeyPanel({ onHeaderActionsChange, onNavigate }) {
  const [copiedKeyId, setCopiedKeyId] = useState(0)
  const [error, setError] = useState('')
  const [formState, setFormState] = useState(DEFAULT_FORM_STATE)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [keys, setKeys] = useState([])

  const loadKeys = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminIapApiKeys()
      setKeys(payload.apiKeys || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load API keys.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadKeys()
  }, [loadKeys])

  const headerActions = useMemo(() => (
    <button type="button" className="ghost-button compact" onClick={() => void loadKeys()} disabled={isLoading || isSaving}>
      <RefreshCw size={17} /> Refresh
    </button>
  ), [isLoading, isSaving, loadKeys])

  useEffect(() => {
    onHeaderActionsChange?.(headerActions)
    return () => onHeaderActionsChange?.(null)
  }, [headerActions, onHeaderActionsChange])

  useEffect(() => {
    if (!copiedKeyId) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setCopiedKeyId(0)
    }, 1600)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [copiedKeyId])

  const openCreateDialog = () => {
    setFormState(DEFAULT_FORM_STATE)
    setIsDialogOpen(true)
    setError('')
  }

  const closeDialog = () => {
    setFormState(DEFAULT_FORM_STATE)
    setIsDialogOpen(false)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const trimmedName = formState.name.trim()
    if (!trimmedName) return
    setIsSaving(true)
    setError('')
    try {
      await createAdminIapApiKey({
        headerFormat: formState.headerFormat,
        headerName: formState.headerName,
        isActive: true,
        method: formState.method,
        name: trimmedName,
      })
      closeDialog()
      await loadKeys()
    } catch (saveError) {
      setError(saveError.message || 'Unable to create API key.')
    } finally {
      setIsSaving(false)
    }
  }

  const removeKey = async (keyRecord) => {
    if (!window.confirm(`Delete API key "${keyRecord.name}"?`)) return
    setError('')
    try {
      await deleteAdminIapApiKey(keyRecord.id)
      await loadKeys()
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete API key.')
    }
  }

  const handleCopyKey = async (keyRecord) => {
    try {
      await navigator.clipboard.writeText(keyRecord.apiKey)
      setCopiedKeyId(keyRecord.id)
    } catch {
      setError('Unable to copy API key.')
    }
  }

  return (
    <div className="iap-tab-panel dev-host">
      <DeveloperMarker code="admin.react.manage.iap.api-key" title="Admin React IAP API Key" />
      <div className="section-toolbar">
        <h2>API keys</h2>
        <div className="toolbar-actions">
          <button type="button" className="ghost-button compact" onClick={() => onNavigate?.('/admin/iap/bank-hook-history')}>
            <History size={17} /> History
          </button>
          <button type="button" className="primary-button compact" onClick={openCreateDialog} disabled={isSaving}>
            <Plus size={17} /> Add new
          </button>
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>Name</th><th>Method</th><th>Header</th><th>Endpoint</th><th>API key</th><th>Last used</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {keys.map((keyRecord) => (
              <tr key={keyRecord.id}>
                <td><strong>{keyRecord.name}</strong><small>{keyRecord.id}</small></td>
                <td>{keyRecord.method}</td>
                <td>
                  <strong>{keyRecord.headerName}</strong>
                  <small>Format: {keyRecord.headerFormat || '<API_KEY>'}</small>
                </td>
                <td>/api/pay/info</td>
                <td>
                  <div className="iap-action-group" role="group" aria-label={`API key actions for ${keyRecord.name}`}>
                    <button
                      type="button"
                      className="iap-action-button"
                      onClick={() => void handleCopyKey(keyRecord)}
                      aria-label={`Copy API key for ${keyRecord.name}`}
                      title={copiedKeyId === keyRecord.id ? 'Copied' : 'Copy API key'}
                    >
                      {copiedKeyId === keyRecord.id ? <Check size={15} className="iap-boolean-indicator iap-boolean-indicator-true" /> : <Copy size={15} />}
                    </button>
                  </div>
                  <small>Send as: {keyRecord.headerFormat || '<API_KEY>'}</small>
                </td>
                <td>{keyRecord.lastUsedAt ? formatDateTime(keyRecord.lastUsedAt) : '-'}</td>
                <td><span className={keyRecord.isActive ? 'status-pill status-success' : 'plan-pill'}>{keyRecord.isActive ? 'Active' : 'Inactive'}</span></td>
                <td><button type="button" className="ghost-button compact danger-text" onClick={() => void removeKey(keyRecord)}><Trash2 size={16} /> Delete</button></td>
              </tr>
            ))}
            {!keys.length && <tr><td colSpan="8" className="empty-cell">{isLoading ? 'Loading API keys...' : 'No API keys created yet.'}</td></tr>}
          </tbody>
        </table>
      </div>

      {isDialogOpen && (
        <div className="dialog-backdrop" role="presentation">
          <form className="credit-dialog package-dialog dev-host" onSubmit={handleSubmit}>
            <DeveloperMarker code="admin.react.manage.iap.api-key-dialog" title="Admin React IAP API Key Dialog" />
            <div className="section-heading compact">
              <p>Payment hook API key</p>
              <h2>Add new API key</h2>
            </div>
            <div className="package-form-grid">
              <label className="field">
                <span>Key name</span>
                <input value={formState.name} onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))} placeholder="Primary bank hook" required />
              </label>
              <label className="field">
                <span>Method</span>
                <select value={formState.method} onChange={(event) => setFormState((current) => ({ ...current, method: event.target.value }))}>
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </label>
              <label className="field">
                <span>Header name</span>
                <input value={formState.headerName} onChange={(event) => setFormState((current) => ({ ...current, headerName: event.target.value }))} placeholder="X-Api-Key" required />
              </label>
              <label className="field field-wide">
                <span>Value format</span>
                <input
                  value={formState.headerFormat}
                  onChange={(event) => setFormState((current) => ({ ...current, headerFormat: event.target.value }))}
                  placeholder="<API_KEY>"
                  required
                />
                <small className="field-hint">Use {'<API_KEY>'} as the placeholder. Example: {'apikey <API_KEY>'} or {'Bearer <API_KEY>'}.</small>
              </label>
              <label className="field">
                <span>Hook endpoint</span>
                <input value="/api/pay/info" readOnly />
              </label>
            </div>
            <div className="dialog-actions">
              <button type="button" className="ghost-button" onClick={closeDialog} disabled={isSaving}>Cancel</button>
              <button type="submit" className="primary-button compact" disabled={isSaving}><Plus size={17} /> {isSaving ? 'Saving...' : 'Create key'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}