import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createAdminIapPackFunction,
  deleteAdminIapPackFunction,
  fetchAdminIapPackFunctions,
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
  premiumDurationDays: '30',
}

function buildFormState(functionRecord) {
  return {
    credits: String(functionRecord?.credits ?? DEFAULT_FORM_STATE.credits),
    premiumDurationDays: String(functionRecord?.premiumDurationDays ?? DEFAULT_FORM_STATE.premiumDurationDays),
  }
}

export default function IapPackageFunctionDialog({ onClose, packageRecord }) {
  const [error, setError] = useState('')
  const [formState, setFormState] = useState(DEFAULT_FORM_STATE)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedFunctionId, setSelectedFunctionId] = useState(0)
  const packType = normalizeIapPackType(packageRecord?.packType)
  const selectedBehavior = getPackFunctionBehavior(packType)

  const loadFunction = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminIapPackFunctions()
      const functionRecord = (payload.packFunctions || []).find((record) => record.packIapId === packageRecord?.id) || null
      setSelectedFunctionId(functionRecord?.id || 0)
      setFormState(buildFormState(functionRecord))
    } catch (loadError) {
      setError(loadError.message || 'Unable to load pack function.')
    } finally {
      setIsLoading(false)
    }
  }, [packageRecord?.id])

  useEffect(() => {
    void loadFunction()
  }, [loadFunction])

  const currentSummary = useMemo(() => {
    if (!selectedFunctionId) {
      return 'No function configured for this package yet.'
    }
    return formatPackFunctionSummary(packType, {
      credits: formState.credits,
      premiumDurationDays: formState.premiumDurationDays,
    })
  }, [formState.credits, formState.premiumDurationDays, packType, selectedFunctionId])

  const detailRows = useMemo(() => ([
    ['Package', packageRecord?.name || '-'],
    ['Package id', packageRecord?.id || '-'],
    ['Pack type', getIapPackTypeLabel(packType)],
    ['Current behavior', currentSummary],
  ]), [currentSummary, packType, packageRecord?.id, packageRecord?.name])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!packageRecord?.id) {
      return
    }
    setIsSaving(true)
    setError('')
    try {
      const payload = {
        ...buildPackFunctionPayload(packType, formState),
        packIapId: packageRecord.id,
      }
      if (selectedFunctionId) {
        await updateAdminIapPackFunction(selectedFunctionId, payload)
      } else {
        await createAdminIapPackFunction(payload)
      }
      onClose()
    } catch (saveError) {
      setError(saveError.message || `Unable to ${selectedFunctionId ? 'update' : 'create'} pack function.`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedFunctionId) {
      return
    }
    if (!window.confirm(`Delete the function for package "${packageRecord?.name}"?`)) {
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await deleteAdminIapPackFunction(selectedFunctionId)
      onClose()
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete pack function.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="credit-dialog package-dialog dev-host" onSubmit={handleSubmit}>
        <DeveloperMarker code="admin.react.manage.iap.package.function-dialog" title="Admin React IAP Package Function Dialog" />
        <div className="section-toolbar">
          <div className="section-heading compact">
            <p>Pack function</p>
            <h2>Edit function</h2>
          </div>
          <div className="toolbar-actions">
            <button type="button" className="ghost-button compact" onClick={() => void loadFunction()} disabled={isLoading || isSaving}><RefreshCw size={17} /> Refresh</button>
          </div>
        </div>

        {error && <div className="notice notice-error">{error}</div>}
        {isLoading && <div className="notice notice-info">Loading pack function...</div>}

        <div className="table-wrap">
          <table className="admin-table compact-table iap-detail-table">
            <tbody>
              {detailRows.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{value || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="package-form-grid">
          {selectedBehavior.usesCredits && (
            <label className="field">
              <span>Credits</span>
              <input type="number" min="0" step="1" value={formState.credits} onChange={(event) => setFormState((current) => ({ ...current, credits: event.target.value }))} disabled={isSaving} />
            </label>
          )}
          {selectedBehavior.usesPremium && (
            <label className="field">
              <span>Premium duration (days)</span>
              <input type="number" min="1" step="1" value={formState.premiumDurationDays} onChange={(event) => setFormState((current) => ({ ...current, premiumDurationDays: event.target.value }))} disabled={isSaving} />
            </label>
          )}
        </div>

        <div className="dialog-actions">
          {selectedFunctionId ? <button type="button" className="ghost-button danger-text" onClick={() => void handleDelete()} disabled={isSaving}><Trash2 size={17} /> Delete function</button> : <span />}
          <div className="toolbar-actions">
            <button type="button" className="ghost-button" onClick={onClose} disabled={isSaving}>Cancel</button>
            <button type="submit" className="primary-button compact" disabled={isLoading || isSaving}><Plus size={17} /> {isSaving ? 'Saving...' : selectedFunctionId ? 'Save changes' : 'Create function'}</button>
          </div>
        </div>
      </form>
    </div>
  )
}