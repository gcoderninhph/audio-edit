import { BadgePercent, KeyRound, Package, Plus, Settings2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createAdminIapApiKey,
  createAdminIapPackFunction,
  createAdminIapSale,
  deleteAdminIapApiKey,
  deleteAdminIapPackFunction,
  deleteAdminIapSale,
  fetchAdminIapApiKeys,
  fetchAdminIapPackFunctions,
  fetchAdminIapSales,
} from '../api/adminApi'
import { formatDateTime } from '../utils/format'
import DeveloperMarker from './DeveloperMarker'
import IapPackagesPanel from './IapPackagesPanel'

const TABS = [
  { key: 'packages', label: 'IAP package', meta: 'Catalog', icon: Package },
  { key: 'api-key', label: 'API key', meta: 'Bank hook', icon: KeyRound },
  { key: 'pack-function', label: 'Pack function', meta: 'Rewards', icon: Settings2 },
  { key: 'sale', label: 'Sale', meta: 'Promotions', icon: BadgePercent },
]

const FUNCTION_LABELS = {
  addCredits: 'Add credits',
  unlockPremium: 'Unlock premium',
}

function toUnixTime(value) {
  if (!value) return 0
  const milliseconds = Date.parse(value)
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : 0
}

function ApiKeyPanel({ onHeaderActionsChange }) {
  const [keys, setKeys] = useState([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [name, setName] = useState('')

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
    <button type="button" className="ghost-button compact" onClick={() => void loadKeys()} disabled={isLoading || isSaving}>Refresh</button>
  ), [isLoading, isSaving, loadKeys])

  useEffect(() => {
    onHeaderActionsChange?.(headerActions)
    return () => onHeaderActionsChange?.(null)
  }, [headerActions, onHeaderActionsChange])

  const addKey = async (event) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return
    setIsSaving(true)
    setError('')
    try {
      await createAdminIapApiKey({ name: trimmedName, isActive: true })
      setName('')
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

  return (
    <div className="iap-tab-panel dev-host">
      <DeveloperMarker code="admin.react.manage.iap.api-key" title="Admin React IAP API Key" />
      <form className="iap-config-grid" onSubmit={addKey}>
        <label className="field field-wide"><span>Key name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Primary bank hook" /></label>
        <label className="field field-wide"><span>Hook endpoint</span><input value="/api/pay/info" readOnly /></label>
        <button type="submit" className="primary-button compact" disabled={isSaving}><Plus size={17} /> Add key</button>
      </form>
      {error && <div className="notice notice-error">{error}</div>}
      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>Name</th><th>Endpoint</th><th>API key</th><th>Last used</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {keys.map((keyRecord) => (
              <tr key={keyRecord.id}>
                <td><strong>{keyRecord.name}</strong><small>{keyRecord.id}</small></td>
                <td>/api/pay/info</td>
                <td><code className="inline-code">{keyRecord.apiKey}</code></td>
                <td>{keyRecord.lastUsedAt ? formatDateTime(keyRecord.lastUsedAt) : '-'}</td>
                <td><span className={keyRecord.isActive ? 'status-pill status-success' : 'plan-pill'}>{keyRecord.isActive ? 'Active' : 'Inactive'}</span></td>
                <td><button type="button" className="ghost-button compact danger-text" onClick={() => void removeKey(keyRecord)}><Trash2 size={16} /> Delete</button></td>
              </tr>
            ))}
            {!keys.length && <tr><td colSpan="6" className="empty-cell">{isLoading ? 'Loading API keys...' : 'No API keys created yet.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PackFunctionPanel({ onHeaderActionsChange }) {
  const [functions, setFunctions] = useState([])
  const [error, setError] = useState('')
  const [formState, setFormState] = useState({ action: 'addCredits', credits: '1000', packIapId: '', premiumMode: 'lifetime' })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const loadFunctions = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminIapPackFunctions()
      setFunctions(payload.packFunctions || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load pack functions.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadFunctions()
  }, [loadFunctions])

  const headerActions = useMemo(() => (
    <button type="button" className="ghost-button compact" onClick={() => void loadFunctions()} disabled={isLoading || isSaving}>Refresh</button>
  ), [isLoading, isSaving, loadFunctions])

  useEffect(() => {
    onHeaderActionsChange?.(headerActions)
    return () => onHeaderActionsChange?.(null)
  }, [headerActions, onHeaderActionsChange])

  const addFunction = async (event) => {
    event.preventDefault()
    const packIapId = formState.packIapId.trim()
    if (!packIapId) return
    setIsSaving(true)
    setError('')
    try {
      await createAdminIapPackFunction({
        credits: Number(formState.credits || 0),
        functionType: formState.action,
        packIapId,
        premiumMode: formState.premiumMode,
      })
      setFormState((current) => ({ ...current, packIapId: '' }))
      await loadFunctions()
    } catch (saveError) {
      setError(saveError.message || 'Unable to create pack function.')
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
      <form className="iap-config-grid" onSubmit={addFunction}>
        <label className="field"><span>packIapId</span><input value={formState.packIapId} onChange={(event) => setFormState((current) => ({ ...current, packIapId: event.target.value }))} placeholder="coin-pack-1000" /></label>
        <label className="field"><span>Function</span><select value={formState.action} onChange={(event) => setFormState((current) => ({ ...current, action: event.target.value }))}><option value="addCredits">Add credits</option><option value="unlockPremium">Unlock premium</option></select></label>
        <label className="field"><span>Credits</span><input type="number" min="0" step="1" value={formState.credits} onChange={(event) => setFormState((current) => ({ ...current, credits: event.target.value }))} /></label>
        <label className="field"><span>Premium</span><select value={formState.premiumMode} onChange={(event) => setFormState((current) => ({ ...current, premiumMode: event.target.value }))}><option value="lifetime">Lifetime</option><option value="none">None</option></select></label>
        <button type="submit" className="primary-button compact" disabled={isSaving}><Plus size={17} /> Add function</button>
      </form>
      {error && <div className="notice notice-error">{error}</div>}
      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>Pack</th><th>Function</th><th>Credits</th><th>Premium</th><th>Actions</th></tr></thead>
          <tbody>
            {functions.map((functionRecord) => (
              <tr key={functionRecord.id}>
                <td><strong>{functionRecord.packIapId}</strong></td>
                <td>{FUNCTION_LABELS[functionRecord.functionType]}</td>
                <td>{functionRecord.credits}</td>
                <td>{functionRecord.premiumMode === 'lifetime' ? 'Unlock premium' : 'None'}</td>
                <td><button type="button" className="ghost-button compact danger-text" onClick={() => void removeFunction(functionRecord)}><Trash2 size={16} /> Delete</button></td>
              </tr>
            ))}
            {!functions.length && <tr><td colSpan="5" className="empty-cell">{isLoading ? 'Loading pack functions...' : 'No pack functions created yet.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SalePanel({ onHeaderActionsChange }) {
  const [sales, setSales] = useState([])
  const [error, setError] = useState('')
  const [formState, setFormState] = useState({ discountPercent: '10', endAt: '', firstIapPurchase: false, firstPackPurchase: false, name: '', packId: '', startAt: '' })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

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
    <button type="button" className="ghost-button compact" onClick={() => void loadSales()} disabled={isLoading || isSaving}>Refresh</button>
  ), [isLoading, isSaving, loadSales])

  useEffect(() => {
    onHeaderActionsChange?.(headerActions)
    return () => onHeaderActionsChange?.(null)
  }, [headerActions, onHeaderActionsChange])

  const addSale = async (event) => {
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
      setFormState((current) => ({ ...current, name: '', packId: '' }))
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
      <form className="iap-config-grid" onSubmit={addSale}>
        <label className="field"><span>Sale name</span><input value={formState.name} onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))} placeholder="First purchase" /></label>
        <label className="field"><span>packId</span><input value={formState.packId} onChange={(event) => setFormState((current) => ({ ...current, packId: event.target.value }))} placeholder="coin-pack-1000" /></label>
        <label className="field"><span>Discount %</span><input type="number" min="0" max="100" step="1" value={formState.discountPercent} onChange={(event) => setFormState((current) => ({ ...current, discountPercent: event.target.value }))} /></label>
        <label className="field"><span>Start</span><input type="datetime-local" value={formState.startAt} onChange={(event) => setFormState((current) => ({ ...current, startAt: event.target.value }))} /></label>
        <label className="field"><span>End</span><input type="datetime-local" value={formState.endAt} onChange={(event) => setFormState((current) => ({ ...current, endAt: event.target.value }))} /></label>
        <label className="checkbox-field"><input type="checkbox" checked={formState.firstPackPurchase} onChange={(event) => setFormState((current) => ({ ...current, firstPackPurchase: event.target.checked }))} /><span>First time buying this pack</span></label>
        <label className="checkbox-field"><input type="checkbox" checked={formState.firstIapPurchase} onChange={(event) => setFormState((current) => ({ ...current, firstIapPurchase: event.target.checked }))} /><span>First IAP purchase</span></label>
        <button type="submit" className="primary-button compact" disabled={isSaving}><Plus size={17} /> Add sale</button>
      </form>
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
    </div>
  )
}

export default function IapManagementTabs({ onHeaderActionsChange }) {
  const [activeTab, setActiveTab] = useState('packages')

  return (
    <section className="panel iap-tabs-shell dev-host">
      <DeveloperMarker code="admin.react.manage.iap" title="Admin React IAP" />
      <div className="iap-tabs" role="tablist" aria-label="IAP admin sections">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button key={tab.key} type="button" role="tab" aria-selected={isActive} className={`iap-tab${isActive ? ' iap-tab-active' : ''}`} onClick={() => setActiveTab(tab.key)}>
              <Icon size={18} />
              <span><strong>{tab.label}</strong><small>{tab.meta}</small></span>
            </button>
          )
        })}
      </div>
      <div className="iap-tab-content">
        {activeTab === 'packages' && <IapPackagesPanel onHeaderActionsChange={onHeaderActionsChange} />}
        {activeTab === 'api-key' && <ApiKeyPanel onHeaderActionsChange={onHeaderActionsChange} />}
        {activeTab === 'pack-function' && <PackFunctionPanel onHeaderActionsChange={onHeaderActionsChange} />}
        {activeTab === 'sale' && <SalePanel onHeaderActionsChange={onHeaderActionsChange} />}
      </div>
    </section>
  )
}