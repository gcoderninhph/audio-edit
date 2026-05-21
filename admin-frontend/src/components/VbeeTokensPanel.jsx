import { Edit3, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { createAdminVbeeToken, deleteAdminVbeeToken, fetchAdminVbeeTokens, updateAdminVbeeToken } from '../api/adminVbeeApi'
import { formatNumber } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'

const EMPTY_FORM = {
  clientId: '',
  isActive: true,
  maxConcurrentRequests: 1,
  name: '',
  token: '',
}

export default function VbeeTokensPanel() {
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
      const payload = await fetchAdminVbeeTokens()
      setTokens(payload.tokens || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load Vbee tokens.')
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
      clientId: token.clientId || '',
      isActive: Boolean(token.isActive),
      maxConcurrentRequests: token.maxConcurrentRequests || 1,
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
        await updateAdminVbeeToken(editingToken.id, payload)
      } else {
        await createAdminVbeeToken(formState)
      }
      closeForm()
      await loadTokens()
    } catch (saveError) {
      setError(saveError.message || 'Unable to save Vbee token.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (token) => {
    if (!window.confirm(`Delete Vbee token "${token.name}"?`)) return
    setError('')
    try {
      await deleteAdminVbeeToken(token.id)
      await loadTokens()
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete Vbee token.')
    }
  }

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.service.vbee.tokens" title="Admin React Vbee Tokens" />
      <div className="section-toolbar">
        <div className="section-heading compact">
          <p>Vbee</p>
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
          <thead><tr><th>Token</th><th>Client id</th><th>Concurrent</th><th>Status</th><th>Processed</th><th>Actions</th></tr></thead>
          <tbody>
            {tokens.map((token) => (
              <tr key={token.id}>
                <td><strong>{token.name}</strong><small>{token.tokenPreview}</small></td>
                <td>{token.clientId || '-'}</td>
                <td>{token.maxConcurrentRequests}</td>
                <td><span className={`status-pill status-${token.isActive ? 'success' : 'failed'}`}>{token.isActive ? 'active' : 'inactive'}</span></td>
                <td><strong>{formatNumber(token.stats?.processedRequestCount)}</strong><small>{formatNumber(token.stats?.processedCharacterCount)} chars</small></td>
                <td>
                  <div className="iap-action-group" role="group" aria-label={`Actions for ${token.name}`}>
                    <button type="button" className="iap-action-button" title="Edit" aria-label={`Edit ${token.name}`} onClick={() => openEditForm(token)}><Edit3 size={16} /></button>
                    <button type="button" className="iap-action-button iap-action-button-danger" title="Delete" aria-label={`Delete ${token.name}`} onClick={() => void handleDelete(token)}><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!tokens.length && <tr><td colSpan="6" className="empty-cell">{isLoading ? 'Loading Vbee tokens...' : 'No Vbee tokens created yet.'}</td></tr>}
          </tbody>
        </table>
      </div>

      {isFormOpen && (
        <div className="dialog-backdrop" role="presentation">
          <form className="credit-dialog package-dialog dev-host" onSubmit={handleSubmit}>
            <DeveloperMarker code="admin.react.service.vbee.tokens.form" title="Admin React Vbee Token Form" />
            <div className="section-heading compact">
              <p>Vbee</p>
              <h2>{editingToken ? 'Edit token' : 'Add token'}</h2>
            </div>
            <div className="package-form-grid">
              <label className="field"><span>Name</span><input value={formState.name} onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))} required /></label>
              <label className="field"><span>Client id</span><input value={formState.clientId} onChange={(event) => setFormState((current) => ({ ...current, clientId: event.target.value }))} /></label>
              <label className="field"><span>Token</span><input type="password" value={formState.token} onChange={(event) => setFormState((current) => ({ ...current, token: event.target.value }))} required={!editingToken} /></label>
              <label className="field"><span>Max concurrent</span><input type="number" min="1" max="20" value={formState.maxConcurrentRequests} onChange={(event) => setFormState((current) => ({ ...current, maxConcurrentRequests: Number(event.target.value) || 1 }))} required /></label>
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