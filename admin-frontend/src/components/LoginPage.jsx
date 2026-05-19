import { LogIn } from 'lucide-react'
import { useState } from 'react'
import { loginAdmin } from '../api/adminApi'
import DeveloperMarker from './DeveloperMarker'

export default function LoginPage({ onLogin, initialNotice }) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const nextSession = await loginAdmin(identifier.trim(), password)
      onLogin(nextSession)
    } catch (loginError) {
      setError(loginError.message || 'Login failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="auth-page dev-host">
      <DeveloperMarker code="admin.react.login" title="Admin React Login" />
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="section-heading compact">
          <p>Backend Admin</p>
          <h1>Admin login</h1>
        </div>
        {initialNotice && <div className="notice notice-info">{initialNotice}</div>}
        {error && <div className="notice notice-error">{error}</div>}
        <label className="field">
          <span>Email or username</span>
          <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        <button type="submit" className="primary-button" disabled={isSubmitting}>
          <LogIn size={18} /> {isSubmitting ? 'Signing in...' : 'Login'}
        </button>
      </form>
    </section>
  )
}