import { Package, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createAdminIapPackage,
  deleteAdminIapPackage,
  fetchAdminIapPackages,
  updateAdminIapPackage,
} from '../api/adminApi'
import { formatCurrency, formatDateTime } from '../utils/format'
import { DEFAULT_IAP_PACK_TYPE, getIapPackTypeLabel, IAP_PACK_TYPE_OPTIONS, normalizeIapPackType } from '../utils/iapPackages'
import DeveloperMarker from './DeveloperMarker'

const MAX_PACKAGE_DETAIL_LENGTH = 30

const DEFAULT_FORM_STATE = {
  currency: 'VND',
  description: '',
  id: '',
  isActive: true,
  isRecommended: false,
  name: '',
  packType: DEFAULT_IAP_PACK_TYPE,
  price: '',
}

function buildPackageDetail(packageRecord) {
  return [packageRecord?.id, packageRecord?.description].filter(Boolean).join(' · ')
}

function truncateText(value, maxLength) {
  const normalizedValue = String(value || '').trim()
  if (!normalizedValue || normalizedValue.length <= maxLength) {
    return normalizedValue
  }
  if (maxLength <= 3) {
    return normalizedValue.slice(0, maxLength)
  }
  return `${normalizedValue.slice(0, maxLength - 3)}...`
}

function buildPayload(formState) {
  return {
    currency: String(formState.currency || 'VND').trim().toUpperCase(),
    description: String(formState.description || '').trim(),
    id: String(formState.id || '').trim(),
    isActive: Boolean(formState.isActive),
    isRecommended: Boolean(formState.isRecommended),
    name: String(formState.name || '').trim(),
    packType: normalizeIapPackType(formState.packType),
    price: Number(formState.price || 0),
  }
}

function buildFormState(packageRecord) {
  if (!packageRecord) return DEFAULT_FORM_STATE
  return {
    currency: packageRecord.currency || 'VND',
    description: packageRecord.description || '',
    id: packageRecord.id || '',
    isActive: Boolean(packageRecord.isActive),
    isRecommended: Boolean(packageRecord.isRecommended),
    name: packageRecord.name || '',
    packType: normalizeIapPackType(packageRecord.packType),
    price: String(packageRecord.price ?? ''),
  }
}

export default function IapPackagesPanel({ onHeaderActionsChange }) {
  const [dialogError, setDialogError] = useState('')
  const [packages, setPackages] = useState([])
  const [error, setError] = useState('')
  const [formState, setFormState] = useState(DEFAULT_FORM_STATE)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedPackageId, setSelectedPackageId] = useState('')

  const loadPackages = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminIapPackages()
      setPackages(payload.packages || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load IAP packages.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPackages()
  }, [loadPackages])

  const headerActions = useMemo(() => (
    <button type="button" className="ghost-button compact" onClick={() => void loadPackages()} disabled={isLoading || isSaving}>
      <RefreshCw size={17} /> Refresh
    </button>
  ), [isLoading, isSaving, loadPackages])

  useEffect(() => {
    onHeaderActionsChange?.(headerActions)
    return () => onHeaderActionsChange?.(null)
  }, [headerActions, onHeaderActionsChange])

  const openCreateDialog = () => {
    setSelectedPackageId('')
    setFormState(DEFAULT_FORM_STATE)
    setIsDialogOpen(true)
    setError('')
    setDialogError('')
  }

  const openEditDialog = (packageRecord) => {
    setSelectedPackageId(packageRecord.id)
    setFormState(buildFormState(packageRecord))
    setIsDialogOpen(true)
    setError('')
    setDialogError('')
  }

  const closeDialog = () => {
    setIsDialogOpen(false)
    setSelectedPackageId('')
    setFormState(DEFAULT_FORM_STATE)
    setDialogError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    setDialogError('')
    try {
      const payload = buildPayload(formState)
      if (selectedPackageId) {
        await updateAdminIapPackage(selectedPackageId, {
          currency: payload.currency,
          description: payload.description,
          isActive: payload.isActive,
          isRecommended: payload.isRecommended,
          name: payload.name,
          packType: payload.packType,
          price: payload.price,
        })
      } else {
        await createAdminIapPackage(payload)
      }
      closeDialog()
      await loadPackages()
    } catch (saveError) {
      const nextError = saveError.message || 'Unable to save IAP package.'
      setDialogError(nextError)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (packageRecord) => {
    if (!window.confirm(`Delete IAP package "${packageRecord.name}"?`)) return
    setError('')
    try {
      await deleteAdminIapPackage(packageRecord.id)
      await loadPackages()
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete IAP package.')
    }
  }

  return (
    <div className="iap-tab-panel dev-host">
      <DeveloperMarker code="admin.react.manage.iap.package" title="Admin React IAP Packages" />
      <div className="section-toolbar">
        <h2>IAP packages</h2>
        <div className="toolbar-actions">
          <button type="button" className="primary-button compact" onClick={openCreateDialog} disabled={isSaving}>
            <Plus size={17} /> New package
          </button>
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Pack</th>
              <th>Pack type</th>
              <th>Price</th>
              <th>Recommend</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((packageRecord) => (
              <tr key={packageRecord.id}>
                <td>
                  <div className="user-cell">
                    <Package size={18} />
                    <span>
                      <strong>{packageRecord.name}</strong>
                      <small title={buildPackageDetail(packageRecord)}>{truncateText(buildPackageDetail(packageRecord), MAX_PACKAGE_DETAIL_LENGTH)}</small>
                    </span>
                  </div>
                </td>
                <td>{getIapPackTypeLabel(packageRecord.packType)}</td>
                <td>
                  <strong>{formatCurrency(packageRecord.price, packageRecord.currency)}</strong>
                  <small>{packageRecord.currency}</small>
                </td>
                <td>
                  <span className={packageRecord.isRecommended ? 'status-pill status-success' : 'plan-pill'}>
                    {packageRecord.isRecommended ? 'Recommended' : '-'}
                  </span>
                </td>
                <td>
                  <span className={packageRecord.isActive ? 'status-pill status-success' : 'plan-pill'}>
                    {packageRecord.isActive ? 'Active' : 'Hidden'}
                  </span>
                </td>
                <td>{formatDateTime(packageRecord.updatedAt)}</td>
                <td>
                  <div className="iap-action-group" role="group" aria-label={`Package actions for ${packageRecord.name}`}>
                    <button
                      type="button"
                      className="iap-action-button"
                      onClick={() => openEditDialog(packageRecord)}
                      aria-label={`Edit package ${packageRecord.name}`}
                      title="Edit package"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="iap-action-button iap-action-button-danger"
                      onClick={() => void handleDelete(packageRecord)}
                      aria-label={`Delete package ${packageRecord.name}`}
                      title="Delete package"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!packages.length && (
              <tr>
                <td colSpan="7" className="empty-cell">{isLoading ? 'Loading IAP packages...' : 'No IAP packages created yet.'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isDialogOpen && (
        <div className="dialog-backdrop" role="presentation">
          <form className="credit-dialog package-dialog dev-host" onSubmit={handleSubmit}>
            <DeveloperMarker code="admin.react.manage.iap-dialog" title="Admin React IAP Package Dialog" />
            <div className="section-heading compact">
              <p>IAP package</p>
              <h2>{selectedPackageId ? 'Edit package' : 'Create package'}</h2>
            </div>
            {dialogError && <div className="notice notice-error">{dialogError}</div>}
            <div className="package-form-grid">
              <label className="field">
                <span>Package id</span>
                <input
                  value={formState.id}
                  onChange={(event) => setFormState((current) => ({ ...current, id: event.target.value }))}
                  placeholder="coin-pack-1000"
                  required
                  disabled={Boolean(selectedPackageId) || isSaving}
                />
              </label>
              <label className="field">
                <span>Pack name</span>
                <input
                  value={formState.name}
                  onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                  placeholder="1,000 credit pack"
                  required
                  disabled={isSaving}
                />
              </label>
              <label className="field">
                <span>Pack type</span>
                <select
                  value={formState.packType}
                  onChange={(event) => setFormState((current) => ({ ...current, packType: event.target.value }))}
                  disabled={isSaving}
                >
                  {IAP_PACK_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Price</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={formState.price}
                  onChange={(event) => setFormState((current) => ({ ...current, price: event.target.value }))}
                  required
                  disabled={isSaving}
                />
              </label>
              <label className="field">
                <span>Currency</span>
                <input
                  value={formState.currency}
                  onChange={(event) => setFormState((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                  maxLength={3}
                  required
                  disabled={isSaving}
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={formState.isActive}
                  onChange={(event) => setFormState((current) => ({ ...current, isActive: event.target.checked }))}
                  disabled={isSaving}
                />
                <span>Expose this package in the public client API</span>
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={formState.isRecommended}
                  onChange={(event) => setFormState((current) => ({ ...current, isRecommended: event.target.checked }))}
                  disabled={isSaving}
                />
                <span>Mark this package as recommended in the desktop client</span>
              </label>
              <label className="field package-description-field">
                <span>Description</span>
                <textarea
                  rows="4"
                  value={formState.description}
                  onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                  maxLength={500}
                  disabled={isSaving}
                />
              </label>
            </div>
            <div className="dialog-actions">
              <button type="button" className="ghost-button" onClick={closeDialog} disabled={isSaving}>Cancel</button>
              <button type="submit" className="primary-button compact" disabled={isSaving}>
                <Plus size={17} /> {isSaving ? 'Saving...' : selectedPackageId ? 'Save changes' : 'Create package'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
