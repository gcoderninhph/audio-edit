import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createAdminIapPackFunction,
  deleteAdminIapPackFunction,
  fetchAdminIapPackFunctions,
  fetchAdminIapPackages,
  updateAdminIapPackFunction,
} from '../api/adminApi'
import {
  buildPackFunctionPayload,
  formatPackFunctionSummary,
  getIapPackTypeLabel,
  getPackFunctionBehavior,
  normalizeIapPackType,
} from '../utils/iapPackages'
import DeveloperMarker from './DeveloperMarker'

const DEFAULT_FORM_STATE = {
  credits: '1000',
  packIapId: '',
  premiumDurationDays: '30',
}

function buildFormState(functionRecord) {
  return {
    credits: String(functionRecord?.credits ?? DEFAULT_FORM_STATE.credits),
    packIapId: functionRecord?.packIapId || '',
    premiumDurationDays: String(functionRecord?.premiumDurationDays ?? DEFAULT_FORM_STATE.premiumDurationDays),
  }
}

export default function IapPackFunctionPanel({ onHeaderActionsChange }) {
  const [error, setError] = useState('')
  const [formState, setFormState] = useState(DEFAULT_FORM_STATE)
  const [functions, setFunctions] = useState([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [packages, setPackages] = useState([])
  const [selectedFunctionId, setSelectedFunctionId] = useState(0)

  const loadPackages = useCallback(async () => {
    const payload = await fetchAdminIapPackages()
    setPackages(payload.packages || [])
  }, [])

  const loadFunctions = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [functionPayload] = await Promise.all([
        fetchAdminIapPackFunctions(),
        loadPackages(),
      ])
      setFunctions(functionPayload.packFunctions || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load pack functions.')
    } finally {
      setIsLoading(false)
    }
  }, [loadPackages])

  useEffect(() => {
    void loadFunctions()
  }, [loadFunctions])

  const headerActions = useMemo(() => (
    <button type="button" className="ghost-button compact" onClick={() => void loadFunctions()} disabled={isLoading || isSaving}>
      <RefreshCw size={17} /> Refresh
    </button>
  ), [isLoading, isSaving, loadFunctions])

  useEffect(() => {
    onHeaderActionsChange?.(headerActions)
    return () => onHeaderActionsChange?.(null)
  }, [headerActions, onHeaderActionsChange])

  const packageMap = useMemo(() => new Map(packages.map((packageRecord) => [packageRecord.id, packageRecord])), [packages])
  const selectedPackage = packageMap.get(formState.packIapId) || packages[0] || null
  const selectedPackType = normalizeIapPackType(selectedPackage?.packType)
  const selectedBehavior = getPackFunctionBehavior(selectedPackType)

  const openCreateDialog = () => {
    const firstPackageId = packages[0]?.id || ''
    setSelectedFunctionId(0)
    setFormState({ ...DEFAULT_FORM_STATE, packIapId: firstPackageId })
    setIsDialogOpen(true)
    setError('')
  }

  const openEditDialog = (functionRecord) => {
    setSelectedFunctionId(functionRecord.id)
    setFormState(buildFormState(functionRecord))
    setIsDialogOpen(true)
    setError('')
  }

  const closeDialog = () => {
    setSelectedFunctionId(0)
    setFormState(DEFAULT_FORM_STATE)
    setIsDialogOpen(false)
  }

  const handlePackChange = (packIapId) => {
    const nextPackage = packageMap.get(packIapId)
    const nextBehavior = getPackFunctionBehavior(nextPackage?.packType)
    setFormState((current) => ({
      ...current,
      credits: nextBehavior.usesCredits ? current.credits : '0',
      packIapId,
      premiumDurationDays: nextBehavior.usesPremium
        ? (current.premiumDurationDays && current.premiumDurationDays !== '0' ? current.premiumDurationDays : DEFAULT_FORM_STATE.premiumDurationDays)
        : '0',
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!selectedPackage?.id) return
    setIsSaving(true)
    setError('')
    try {
      const payload = {
        ...buildPackFunctionPayload(selectedPackType, formState),
        packIapId: selectedPackage.id,
      }
      if (selectedFunctionId) {
        await updateAdminIapPackFunction(selectedFunctionId, payload)
      } else {
        await createAdminIapPackFunction(payload)
      }
      closeDialog()
      await loadFunctions()
    } catch (saveError) {
      setError(saveError.message || `Unable to ${selectedFunctionId ? 'update' : 'create'} pack function.`)
    } finally {
      setIsSaving(false)
    }
  }

  const removeFunction = async (functionRecord) => {
    setError('')
    try {
      await deleteAdminIapPackFunction(functionRecord.id)
      await loadFunctions()
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete pack function.')
    }
  }

  return (
    <div className="iap-tab-panel dev-host">
      <DeveloperMarker code="admin.react.manage.iap.pack-function" title="Admin React IAP Pack Function" />
      <div className="section-toolbar">
        <h2>Pack functions</h2>
        <div className="toolbar-actions">
          <button type="button" className="primary-button compact" onClick={openCreateDialog} disabled={isSaving || !packages.length}>
            <Plus size={17} /> Add new
          </button>
        </div>
      </div>

      {!packages.length && !isLoading && <div className="notice notice-info">Create an IAP package first before adding pack functions.</div>}
      {error && <div className="notice notice-error">{error}</div>}

      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>Pack</th><th>Pack type</th><th>Benefits</th><th>Actions</th></tr></thead>
          <tbody>
            {functions.map((functionRecord) => {
              const packageRecord = packageMap.get(functionRecord.packIapId)
              const packType = normalizeIapPackType(packageRecord?.packType)
              return (
                <tr key={functionRecord.id}>
                  <td><strong>{packageRecord?.name || functionRecord.packIapId}</strong><small>{functionRecord.packIapId}</small></td>
                  <td>{getIapPackTypeLabel(packType)}</td>
                  <td>{formatPackFunctionSummary(packType, functionRecord)}</td>
                  <td>
                    <div className="iap-action-group" role="group" aria-label={`Pack function actions for ${packageRecord?.name || functionRecord.packIapId}`}>
                      <button
                        type="button"
                        className="iap-action-button"
                        onClick={() => openEditDialog(functionRecord)}
                        aria-label={`Edit pack function ${functionRecord.id}`}
                        title="Edit pack function"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="iap-action-button iap-action-button-danger"
                        onClick={() => void removeFunction(functionRecord)}
                        aria-label={`Delete pack function ${functionRecord.id}`}
                        title="Delete pack function"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {!functions.length && <tr><td colSpan="4" className="empty-cell">{isLoading ? 'Loading pack functions...' : 'No pack functions created yet.'}</td></tr>}
          </tbody>
        </table>
      </div>

      {isDialogOpen && (
        <div className="dialog-backdrop" role="presentation">
          <form className="credit-dialog package-dialog dev-host" onSubmit={handleSubmit}>
            <DeveloperMarker code="admin.react.manage.iap.pack-function-dialog" title="Admin React IAP Pack Function Dialog" />
            <div className="section-heading compact">
              <p>Pack function</p>
              <h2>{selectedFunctionId ? 'Edit pack function' : 'Add new pack function'}</h2>
            </div>
            <div className="package-form-grid">
              <label className="field">
                <span>packIapId</span>
                <select value={selectedPackage?.id || ''} onChange={(event) => handlePackChange(event.target.value)} required>
                  {packages.map((packageRecord) => (
                    <option key={packageRecord.id} value={packageRecord.id}>{packageRecord.name} ({packageRecord.id})</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Pack type</span>
                <input value={getIapPackTypeLabel(selectedPackType)} readOnly />
              </label>
              {selectedBehavior.usesCredits && (
                <label className="field">
                  <span>Credits</span>
                  <input type="number" min="0" step="1" value={formState.credits} onChange={(event) => setFormState((current) => ({ ...current, credits: event.target.value }))} />
                </label>
              )}
              {selectedBehavior.usesPremium && (
                <label className="field">
                  <span>Premium duration (days)</span>
                  <input type="number" min="1" step="1" value={formState.premiumDurationDays} onChange={(event) => setFormState((current) => ({ ...current, premiumDurationDays: event.target.value }))} />
                </label>
              )}
            </div>
            <div className="dialog-actions">
              <button type="button" className="ghost-button" onClick={closeDialog} disabled={isSaving}>Cancel</button>
              <button type="submit" className="primary-button compact" disabled={isSaving}><Plus size={17} /> {isSaving ? 'Saving...' : selectedFunctionId ? 'Save changes' : 'Create function'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}