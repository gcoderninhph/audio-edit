import { Pencil, Plus, RefreshCw, Save, Server, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { createAdminWhisperNode, deleteAdminWhisperNode, fetchAdminWhisperNodes, updateAdminWhisperNode } from '../api/adminWhisperApi'
import { formatDateTime } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'

const EMPTY_FORM = {
  name: '',
  maxConcurrentRequests: 1,
  url: '',
}


export default function WhisperNodesPanel() {
  const [editingNode, setEditingNode] = useState(null)
  const [error, setError] = useState('')
  const [formState, setFormState] = useState(EMPTY_FORM)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [nodes, setNodes] = useState([])
  const [success, setSuccess] = useState('')

  const loadNodes = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminWhisperNodes()
      setNodes(payload.nodes || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load Whisper nodes.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadNodes()
  }, [loadNodes])

  const openCreateForm = () => {
    setEditingNode(null)
    setError('')
    setFormState(EMPTY_FORM)
    setIsFormOpen(true)
    setSuccess('')
  }

  const openEditForm = (node) => {
    setEditingNode(node)
    setError('')
    setFormState({
      name: node?.name || '',
      maxConcurrentRequests: Number(node?.maxConcurrentRequests) || 1,
      url: node?.url || '',
    })
    setIsFormOpen(true)
    setSuccess('')
  }

  const closeForm = () => {
    setEditingNode(null)
    setFormState(EMPTY_FORM)
    setIsFormOpen(false)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const isEditing = Boolean(editingNode?.id)
    setIsSaving(true)
    setError('')
    setSuccess('')
    try {
      if (isEditing) {
        await updateAdminWhisperNode(editingNode.id, formState)
      } else {
        await createAdminWhisperNode(formState)
      }
      closeForm()
      setSuccess(isEditing ? 'Whisper node updated successfully.' : 'Whisper node added successfully.')
      await loadNodes()
    } catch (submitError) {
      setError(submitError.message || (isEditing ? 'Unable to update Whisper node.' : 'Unable to add Whisper node.'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (node) => {
    if (!node?.id) return
    if (node.processingCount > 0) {
      setError('Cannot delete the node while it is processing requests.')
      setSuccess('')
      return
    }
    const confirmed = window.confirm(`Delete Whisper node "${node.name || node.url}"?`)
    if (!confirmed) return
    setIsSaving(true)
    setError('')
    setSuccess('')
    try {
      await deleteAdminWhisperNode(node.id)
      if (editingNode?.id === node.id) {
        closeForm()
      }
      setSuccess('Whisper node deleted successfully.')
      await loadNodes()
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete Whisper node.')
    } finally {
      setIsSaving(false)
    }
  }

  const isEditing = Boolean(editingNode?.id)

  return (
    <section className="panel iap-inline-detail-panel dev-host">
      <DeveloperMarker code="admin.react.service.whisper.nodes" title="Admin React Service Whisper Nodes" />

      <div className="section-toolbar">
        <div className="section-heading compact">
          <p>Whisper</p>
          <h2>Processing nodes</h2>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="ghost-button compact" onClick={() => void loadNodes()} disabled={isLoading || isSaving}>
            <RefreshCw size={17} /> Refresh
          </button>
          <button type="button" className="primary-button compact" onClick={openCreateForm} disabled={isSaving}>
            <Plus size={17} /> Add node
          </button>
        </div>
      </div>

      <div className="notice notice-info">Each node now has its own max concurrent request limit. When all nodes are full, new Whisper requests will wait in the backend queue and start automatically when capacity is free.</div>

      {error && <div className="notice notice-error">{error}</div>}
      {success && <div className="notice notice-info">{success}</div>}

      <div className="table-wrap dev-host">
        <DeveloperMarker code="admin.react.service.whisper.nodes.list" title="Admin React Service Whisper Nodes List" />
        <table className="admin-table compact-table">
          <thead>
            <tr>
              <th>Node</th>
              <th>Concurrent</th>
              <th>Processing</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => (
              <tr key={node.id || node.url}>
                <td>
                  <div className="user-cell">
                    <Server size={16} />
                    <span>
                      <strong className="table-truncate">{node.name || node.url}</strong>
                      <small className="table-truncate">{node.url}</small>
                      <small>Added {formatDateTime(node.createdAt)}</small>
                    </span>
                  </div>
                </td>
                <td>
                  <strong>{node.maxConcurrentRequests}</strong>
                  <small>Maximum parallel requests</small>
                </td>
                <td>
                  <strong>{node.processingCount}</strong>
                  <small>{node.availableCapacity} slot(s) available</small>
                </td>
                <td>{formatDateTime(node.updatedAt)}</td>
                <td>
                  <div className="table-actions">
                    <div className="button-group" role="group" aria-label={`Actions for ${node.name || node.url}`}>
                      <button type="button" className="ghost-button compact" onClick={() => openEditForm(node)} disabled={isSaving}>
                        <Pencil size={16} /> Edit
                      </button>
                      <button
                        type="button"
                        className="ghost-button compact"
                        onClick={() => void handleDelete(node)}
                        disabled={isSaving || Number(node.processingCount) > 0}
                        title={Number(node.processingCount) > 0 ? 'Cannot delete a node while it is processing requests.' : 'Delete this node'}
                      >
                        <Trash2 size={16} /> Delete
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {!nodes.length && (
              <tr>
                <td colSpan="5" className="empty-cell">{isLoading ? 'Loading Whisper nodes...' : 'No Whisper processing nodes configured.'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isFormOpen && (
        <div className="dialog-backdrop" role="presentation">
          <form className="credit-dialog package-dialog dev-host" onSubmit={handleSubmit}>
            <DeveloperMarker code="admin.react.service.whisper.nodes.form" title="Admin React Service Whisper Nodes Form" />
            <div className="section-heading compact">
              <p>Whisper</p>
              <h2>{isEditing ? 'Edit processing node' : 'Add processing node'}</h2>
            </div>
            <div className="package-form-grid">
              <label className="field">
                <span>Node name</span>
                <input
                  type="text"
                  value={formState.name}
                  placeholder="Primary Whisper node"
                  maxLength="120"
                  onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                  required
                />
              </label>
              <label className="field package-description-field">
                <span>Node URL</span>
                <input
                  type="url"
                  value={formState.url}
                  placeholder="http://whisper-node-2:8000"
                  onChange={(event) => setFormState((current) => ({ ...current, url: event.target.value }))}
                  required
                />
              </label>
              <label className="field">
                <span>Max concurrent request</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={formState.maxConcurrentRequests}
                  onChange={(event) => setFormState((current) => ({ ...current, maxConcurrentRequests: Number(event.target.value) || 1 }))}
                  required
                />
              </label>
            </div>
            <div className="dialog-actions">
              <button type="button" className="ghost-button" onClick={closeForm} disabled={isSaving}><X size={16} /> Cancel</button>
              <button type="submit" className="primary-button compact" disabled={isSaving}>
                {isEditing ? <Save size={17} /> : <Plus size={17} />} {isSaving ? 'Saving...' : isEditing ? 'Save changes' : 'Save node'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}