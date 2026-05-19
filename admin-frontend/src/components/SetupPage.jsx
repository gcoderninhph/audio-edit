import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { completeAdminSetup } from '../api/adminApi'
import DeveloperMarker from './DeveloperMarker'

export default function SetupPage({ onComplete }) {
  const [formState, setFormState] = useState({ username: '', displayName: '', password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateField = (field, value) => setFormState((current) => ({ ...current, [field]: value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (formState.password !== formState.confirmPassword) {
      setError('Password confirmation does not match.')
      return
    }
    setIsSubmitting(true)
    try {
      const nextSession = await completeAdminSetup({
        username: formState.username.trim(),
        displayName: formState.displayName.trim(),
        password: formState.password,
      })
      onComplete(nextSession)
    } catch (setupError) {
      setError(setupError.message || 'Unable to create admin account.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="auth-page dev-host">
      <DeveloperMarker code="admin.react.setup" title="Admin React Setup" />
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="section-heading compact">
          <p>Backend Admin</p>
          <h1>Admin setup</h1>
        </div>
        {error && <div className="notice notice-error">{error}</div>}
        <label className="field">
          <span>Admin username</span>
          <input value={formState.username} minLength={3} autoComplete="username" onChange={(event) => updateField('username', event.target.value)} required />
        </label>
        <label className="field">
          <span>Display name</span>
          <input value={formState.displayName} autoComplete="name" onChange={(event) => updateField('displayName', event.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={formState.password} minLength={6} autoComplete="new-password" onChange={(event) => updateField('password', event.target.value)} required />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input type="password" value={formState.confirmPassword} minLength={6} autoComplete="new-password" onChange={(event) => updateField('confirmPassword', event.target.value)} required />
        </label>
        <button type="submit" className="primary-button" disabled={isSubmitting}>
          <ShieldCheck size={18} /> {isSubmitting ? 'Creating...' : 'Create admin account'}
        </button>
      </form>
    </section>
  )
}