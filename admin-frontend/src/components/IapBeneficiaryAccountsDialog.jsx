import { Check, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createAdminIapBeneficiaryAccount,
  deleteAdminIapBeneficiaryAccount,
  fetchAdminIapBeneficiaryAccounts,
  updateAdminIapBeneficiaryAccount,
} from '../api/adminApi'
import IapBeneficiaryAccountDetailPanel from './IapBeneficiaryAccountDetailPanel'
import DeveloperMarker from './DeveloperMarker'

const DEFAULT_FORM_STATE = {
  bankAccount: '',
  bankId: '',
  isCurrent: false,
  name: '',
}

function normalizeBankOptions(payload) {
  const banks = Array.isArray(payload) ? payload : payload?.data || payload?.banks || []
  return banks
    .map((bank) => {
      const id = String(bank.shortName || bank.code || bank.id || bank.bin || '').trim()
      const name = String(bank.name || bank.shortName || bank.code || id).trim()
      return id ? { id, name } : null
    })
    .filter(Boolean)
}

export default function IapBeneficiaryAccountsDialog({ onClose }) {
  const [accounts, setAccounts] = useState([])
  const [banks, setBanks] = useState([])
  const [error, setError] = useState('')
  const [formState, setFormState] = useState(DEFAULT_FORM_STATE)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState(0)

  const loadAccounts = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchAdminIapBeneficiaryAccounts()
      setAccounts(payload.accounts || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load beneficiary accounts.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAccounts()
    fetch('https://qr.sepay.vn/banks.json')
      .then((response) => response.json())
      .then((payload) => setBanks(normalizeBankOptions(payload)))
      .catch(() => setBanks([]))
  }, [loadAccounts])

  const bankOptions = useMemo(() => banks.length ? banks : [{ id: 'TPBank', name: 'TPBank' }], [banks])

  useEffect(() => {
    if (!formState.bankId && bankOptions.length) {
      setFormState((current) => ({ ...current, bankId: bankOptions[0].id }))
    }
  }, [bankOptions, formState.bankId])

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) || null

  useEffect(() => {
    if (!selectedAccountId || selectedAccount || isLoading) {
      return
    }
    setSelectedAccountId(0)
  }, [isLoading, selectedAccount, selectedAccountId])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    try {
      await createAdminIapBeneficiaryAccount(formState)
      setFormState({ ...DEFAULT_FORM_STATE, bankId: bankOptions[0]?.id || '' })
      setIsFormOpen(false)
      await loadAccounts()
    } catch (saveError) {
      setError(saveError.message || 'Unable to create beneficiary account.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCurrentChange = async (account) => {
    if (account.isCurrent) return
    setError('')
    try {
      await updateAdminIapBeneficiaryAccount(account.id, { isCurrent: true })
      await loadAccounts()
    } catch (saveError) {
      setError(saveError.message || 'Unable to select current account.')
    }
  }

  const handleDelete = async (account) => {
    if (!window.confirm(`Delete beneficiary account "${account.name}"?`)) return
    setError('')
    try {
      await deleteAdminIapBeneficiaryAccount(account.id)
      await loadAccounts()
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete beneficiary account.')
    }
  }

  const openForm = () => {
    setFormState({ ...DEFAULT_FORM_STATE, bankId: bankOptions[0]?.id || '' })
    setIsFormOpen(true)
    setError('')
  }

  const closeForm = () => {
    setFormState({ ...DEFAULT_FORM_STATE, bankId: bankOptions[0]?.id || '' })
    setIsFormOpen(false)
  }

  if (selectedAccount) {
    return (
      <IapBeneficiaryAccountDetailPanel
        account={selectedAccount}
        isRefreshing={isLoading}
        onBack={() => setSelectedAccountId(0)}
        onRefresh={() => void loadAccounts()}
      />
    )
  }

  return (
    <>
      <section className="panel iap-inline-detail-panel dev-host">
        <DeveloperMarker code="admin.react.manage.iap.api-key.beneficiaries" title="IAP Beneficiary Accounts Section" />
        <div className="section-toolbar">
          <div className="section-heading compact">
            <p>Payment receiver</p>
            <h2>Beneficiary accounts</h2>
          </div>
          <div className="toolbar-actions">
            <button type="button" className="ghost-button compact" onClick={() => void loadAccounts()} disabled={isLoading || isSaving}><RefreshCw size={17} /> Refresh</button>
            <button type="button" className="primary-button compact" onClick={openForm} disabled={isSaving}><Plus size={17} /> Add account</button>
            {onClose ? <button type="button" className="ghost-button compact" onClick={onClose}><X size={17} /> Hide</button> : null}
          </div>
        </div>

        {error && <div className="notice notice-error">{error}</div>}

        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Current</th><th>Name</th><th>Bank id</th><th>Bank account</th><th>Actions</th></tr></thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="clickable-row" onClick={() => setSelectedAccountId(account.id)}>
                  <td onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={account.isCurrent} onChange={() => void handleCurrentChange(account)} aria-label={`Set ${account.name} as current beneficiary`} /></td>
                  <td><strong>{account.name}</strong><small>{account.id}</small></td>
                  <td>{account.bankId}</td>
                  <td>{account.bankAccount}</td>
                  <td>
                    <button type="button" className="ghost-button compact danger-text" onClick={(event) => {
                      event.stopPropagation()
                      void handleDelete(account)
                    }}><Trash2 size={16} /> Delete</button>
                  </td>
                </tr>
              ))}
              {!accounts.length && <tr><td colSpan="5" className="empty-cell">{isLoading ? 'Loading beneficiary accounts...' : 'No beneficiary accounts created yet.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="iap-dialog-footer-note"><Check size={15} /> Only one beneficiary can be the current account at a time.</div>
      </section>

      {isFormOpen && (
        <div className="dialog-backdrop" role="presentation">
          <form className="credit-dialog package-dialog dev-host" onSubmit={handleSubmit}>
            <DeveloperMarker code="admin.react.manage.iap.api-key.beneficiaries.form" title="IAP Beneficiary Account Form" />
            <div className="section-heading compact">
              <p>Payment receiver</p>
              <h2>Add beneficiary account</h2>
            </div>
            <div className="package-form-grid">
              <label className="field">
                <span>Name</span>
                <input value={formState.name} onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label className="field">
                <span>Bank id</span>
                <select value={formState.bankId} onChange={(event) => setFormState((current) => ({ ...current, bankId: event.target.value }))} required>
                  {bankOptions.map((bank) => <option key={bank.id} value={bank.id}>{bank.name} ({bank.id})</option>)}
                </select>
              </label>
              <label className="field">
                <span>Bank account</span>
                <input value={formState.bankAccount} onChange={(event) => setFormState((current) => ({ ...current, bankAccount: event.target.value }))} required />
              </label>
              <label className="checkbox-field iap-current-checkbox">
                <input type="checkbox" checked={formState.isCurrent} onChange={(event) => setFormState((current) => ({ ...current, isCurrent: event.target.checked }))} />
                <span>Current account</span>
              </label>
            </div>
            <div className="dialog-actions">
              <button type="button" className="ghost-button" onClick={closeForm} disabled={isSaving}>Cancel</button>
              <button type="submit" className="primary-button compact" disabled={isSaving}><Plus size={17} /> {isSaving ? 'Saving...' : 'Add account'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
