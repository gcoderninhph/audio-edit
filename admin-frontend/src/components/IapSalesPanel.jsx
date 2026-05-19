import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createAdminIapSale, deleteAdminIapSale, fetchAdminIapSales } from '../api/adminApi'
import { formatDateTime } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'

const DEFAULT_FORM_STATE = {
  discountPercent: '10',
  endAt: '',
  firstIapPurchase: false,
  firstPackPurchase: false,
  name: '',
  packId: '',
  startAt: '',
}

function toUnixTime(value) {
  if (!value) return 0
  const milliseconds = Date.parse(value)
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : 0
}

export default function IapSalesPanel({ onHeaderActionsChange }) {
  const [error, setError] = useState('')
  const [formState, setFormState] = useState(DEFAULT_FORM_STATE)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [sales, setSales] = useState([])

  const loadSales = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminIapSales()
      setSales(payload.sales || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load sales.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSales()
  }, [loadSales])

  const headerActions = useMemo(() => (
    <button type="button" className="ghost-button compact" onClick={() => void loadSales()} disabled={isLoading || isSaving}>
      <RefreshCw size={17} /> Refresh
    </button>
  ), [isLoading, isSaving, loadSales])

  useEffect(() => {
    onHeaderActionsChange?.(headerActions)
    return () => onHeaderActionsChange?.(null)
  }, [headerActions, onHeaderActionsChange])

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
    if (!formState.name.trim() || !formState.packId.trim()) return
    setIsSaving(true)
    setError('')
    try {
      await createAdminIapSale({
        discountPercent: Number(formState.discountPercent || 0),
        endAt: toUnixTime(formState.endAt),
        firstIapPurchase: formState.firstIapPurchase,
        firstPackPurchase: formState.firstPackPurchase,
        name: formState.name,
        packId: formState.packId,
        startAt: toUnixTime(formState.startAt),
      })
      closeDialog()
      await loadSales()
    } catch (saveError) {
      setError(saveError.message || 'Unable to create sale.')
    } finally {
      setIsSaving(false)
    }
  }

  const removeSale = async (saleRecord) => {
    setError('')
    try {
      await deleteAdminIapSale(saleRecord.id)
      await loadSales()
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete sale.')
    }
  }

  return (
    <div className="iap-tab-panel dev-host">
      <DeveloperMarker code="admin.react.manage.iap.sale" title="Admin React IAP Sale" />
      <div className="section-toolbar">
        <h2>Sales</h2>
        <div className="toolbar-actions">
          <button type="button" className="primary-button compact" onClick={openCreateDialog} disabled={isSaving}>
            <Plus size={17} /> Add new
          </button>
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>Sale</th><th>Pack</th><th>Discount</th><th>Conditions</th><th>Window</th><th>Actions</th></tr></thead>
          <tbody>
            {sales.map((saleRecord) => {
              const conditions = [saleRecord.firstPackPurchase && 'First pack buy', saleRecord.firstIapPurchase && 'First IAP'].filter(Boolean).join(' + ') || '-'
              const windowLabel = [saleRecord.startAt ? formatDateTime(saleRecord.startAt) : '-', saleRecord.endAt ? formatDateTime(saleRecord.endAt) : '-'].join(' -> ')
              return (
                <tr key={saleRecord.id}>
                  <td><strong>{saleRecord.name}</strong></td>
                  <td>{saleRecord.packId}</td>
                  <td>{saleRecord.discountPercent}%</td>
                  <td>{conditions}</td>
                  <td>{windowLabel}</td>
                  <td><button type="button" className="ghost-button compact danger-text" onClick={() => void removeSale(saleRecord)}><Trash2 size={16} /> Delete</button></td>
                </tr>
              )
            })}
            {!sales.length && <tr><td colSpan="6" className="empty-cell">{isLoading ? 'Loading sales...' : 'No sales created yet.'}</td></tr>}
          </tbody>
        </table>
      </div>

      {isDialogOpen && (
        <div className="dialog-backdrop" role="presentation">
          <form className="credit-dialog package-dialog dev-host" onSubmit={handleSubmit}>
            <DeveloperMarker code="admin.react.manage.iap.sale-dialog" title="Admin React IAP Sale Dialog" />
            <div className="section-heading compact">
              <p>Sale</p>
              <h2>Add new sale</h2>
            </div>
            <div className="package-form-grid">
              <label className="field"><span>Sale name</span><input value={formState.name} onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))} placeholder="First purchase" required /></label>
              <label className="field"><span>packId</span><input value={formState.packId} onChange={(event) => setFormState((current) => ({ ...current, packId: event.target.value }))} placeholder="coin-pack-1000" required /></label>
              <label className="field"><span>Discount %</span><input type="number" min="0" max="100" step="1" value={formState.discountPercent} onChange={(event) => setFormState((current) => ({ ...current, discountPercent: event.target.value }))} /></label>
              <label className="field"><span>Start</span><input type="datetime-local" value={formState.startAt} onChange={(event) => setFormState((current) => ({ ...current, startAt: event.target.value }))} /></label>
              <label className="field"><span>End</span><input type="datetime-local" value={formState.endAt} onChange={(event) => setFormState((current) => ({ ...current, endAt: event.target.value }))} /></label>
              <label className="checkbox-field"><input type="checkbox" checked={formState.firstPackPurchase} onChange={(event) => setFormState((current) => ({ ...current, firstPackPurchase: event.target.checked }))} /><span>First time buying this pack</span></label>
              <label className="checkbox-field"><input type="checkbox" checked={formState.firstIapPurchase} onChange={(event) => setFormState((current) => ({ ...current, firstIapPurchase: event.target.checked }))} /><span>First IAP purchase</span></label>
            </div>
            <div className="dialog-actions">
              <button type="button" className="ghost-button" onClick={closeDialog} disabled={isSaving}>Cancel</button>
              <button type="submit" className="primary-button compact" disabled={isSaving}><Plus size={17} /> {isSaving ? 'Saving...' : 'Create sale'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}