import { LogOut, RefreshCw, Shield, UserCircle, Users } from 'lucide-react'
import { useState } from 'react'
import { getIdentityLabel, logoutCurrentSession } from '../api/adminApi'
import DeveloperMarker from './DeveloperMarker'

export default function AdminLayout({ title, user, children, onNavigate, onLogout }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const handleLogout = async () => {
    await logoutCurrentSession()
    setIsMenuOpen(false)
    onLogout()
  }

  return (
    <div className="admin-app-shell">
      <header className="admin-topbar dev-host">
        <DeveloperMarker code="admin.react.header" title="Admin React Header" />
        <button type="button" className="brand-button" onClick={() => onNavigate(user ? '/admin/manage' : '/admin/login')}>
          <span className="brand-icon"><Shield size={20} /></span>
          <span>
            <strong>VideoForge Admin</strong>
            <span>{title}</span>
          </span>
        </button>
        <div className="account-menu">
          <button type="button" className="account-trigger" onClick={() => setIsMenuOpen((current) => !current)}>
            <UserCircle size={22} />
            <span>{getIdentityLabel(user)}</span>
          </button>
          {isMenuOpen && (
            <div className="account-dropdown">
              <button type="button" onClick={() => { setIsMenuOpen(false); onNavigate('/admin/manage') }}>
                <Users size={16} /> User management
              </button>
              <button type="button" onClick={() => window.location.reload()}>
                <RefreshCw size={16} /> Refresh
              </button>
              {user && (
                <button type="button" className="danger-menu-item" onClick={() => void handleLogout()}>
                  <LogOut size={16} /> Logout
                </button>
              )}
            </div>
          )}
        </div>
      </header>
      <main className="admin-main">{children}</main>
    </div>
  )
}