import { Edit3, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { createAdminOpenAiToken, deleteAdminOpenAiToken, fetchAdminOpenAiTokens, updateAdminOpenAiToken } from '../api/adminOpenAiApi'
import { formatDateTime } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'

const EMPTY_FORM = {
  isActive: true,
  name: '',
  token: '',
}

export default function OpenAiTokensPanel() {
  const [editingToken, setEditingToken] = useState(null)
  const [error, setError] = useState('')
  const [formState, setFormState] = useState(EMPTY_FORM)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [tokens, setTokens] = useState([])

  const loadTokens = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminOpenAiTokens()
      setTokens(payload.tokens || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load OpenAI tokens.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTokens()
  }, [loadTokens])

  const openCreateForm = () => {
    setEditingToken(null)
    setFormState(EMPTY_FORM)
    setIsFormOpen(true)
    setError('')
  }

  const openEditForm = (token) => {
    setEditingToken(token)
    setFormState({
      isActive: Boolean(token.isActive),
      name: token.name || '',
      token: '',
    })
    setIsFormOpen(true)
    setError('')
  }

  const closeForm = () => {
    setEditingToken(null)
    setFormState(EMPTY_FORM)
    setIsFormOpen(false)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    try {
      if (editingToken) {
        const payload = { ...formState }
        if (!payload.token) delete payload.token
        await updateAdminOpenAiToken(editingToken.id, payload)
      } else {
        await createAdminOpenAiToken(formState)
      }
      closeForm()
      await loadTokens()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save OpenAI token.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (token) => {
    if (!window.confirm(`Delete OpenAI token "${token.name}"?`)) return
    setError('')
    try {
      await deleteAdminOpenAiToken(token.id)
      await loadTokens()
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete OpenAI token.')
    }
  }

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.service.openai.tokens" title="Admin React OpenAI Tokens" />
      <div className="section-toolbar">
        <div className="section-heading compact">
          <p>OpenAI</p>
          <h2>Token list</h2>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="ghost-button compact" onClick={() => void loadTokens()} disabled={isLoading || isSaving}><RefreshCw size={17} /> Refresh</button>
          <button type="button" className="primary-button compact" onClick={openCreateForm} disabled={isSaving}><Plus size={17} /> Add token</button>
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      <div className="table-wrap">
        <table className="admin-table compact-table">
          <thead><tr><th>Token</th><th>Status</th><th>Last used</th><th>Updated</th><th>Actions</th></tr></thead>
          <tbody>
            {tokens.map((token) => (
              <tr key={token.id}>
                <td><strong>{token.name}</strong><small>{token.tokenPreview || 'No preview'}</small></td>
                <td><span className={`status-pill status-${token.isActive ? 'success' : 'failed'}`}>{token.isActive ? 'active' : 'inactive'}</span></td>
                <td>{formatDateTime(token.lastUsedAt)}</td>
                <td>{formatDateTime(token.updatedAt)}</td>
                <td>
                  <div className="iap-action-group" role="group" aria-label={`Actions for ${token.name}`}>
                    <button type="button" className="iap-action-button" title="Edit" aria-label={`Edit ${token.name}`} onClick={() => openEditForm(token)}><Edit3 size={16} /></button>
                    <button type="button" className="iap-action-button iap-action-button-danger" title="Delete" aria-label={`Delete ${token.name}`} onClick={() => void handleDelete(token)}><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!tokens.length && <tr><td colSpan="5" className="empty-cell">{isLoading ? 'Loading OpenAI tokens...' : 'No OpenAI tokens created yet.'}</td></tr>}
          </tbody>
        </table>
      </div>

      {isFormOpen && (
        <div className="dialog-backdrop" role="presentation">
          <form className="credit-dialog package-dialog dev-host" onSubmit={handleSubmit}>
            <DeveloperMarker code="admin.react.service.openai.tokens.form" title="Admin React OpenAI Token Form" />
            <div className="section-heading compact">
              <p>OpenAI</p>
              <h2>{editingToken ? 'Edit token' : 'Add token'}</h2>
            </div>
            <div className="package-form-grid">
              <label className="field"><span>Name</span><input value={formState.name} onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))} required /></label>
              <label className="field"><span>API token</span><input type="password" value={formState.token} onChange={(event) => setFormState((current) => ({ ...current, token: event.target.value }))} required={!editingToken} /></label>
              <label className="checkbox-field iap-current-checkbox"><input type="checkbox" checked={formState.isActive} onChange={(event) => setFormState((current) => ({ ...current, isActive: event.target.checked }))} /><span>Active</span></label>
            </div>
            <div className="dialog-actions">
              <button type="button" className="ghost-button" onClick={closeForm} disabled={isSaving}><X size={16} /> Cancel</button>
              <button type="submit" className="primary-button compact" disabled={isSaving}><Plus size={17} /> {isSaving ? 'Saving...' : 'Save token'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}