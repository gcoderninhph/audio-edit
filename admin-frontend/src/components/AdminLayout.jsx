import { LogOut, Package, RefreshCw, Shield, UserCircle, Users } from 'lucide-react'
import { useState } from 'react'
import { getIdentityLabel, logoutCurrentSession } from '../api/adminApi'
import DeveloperMarker from './DeveloperMarker'

const NAVIGATION_ITEMS = [
  {
    description: 'Users, roles, and premium access',
    icon: Users,
    key: 'manage',
    label: 'User manager',
    matches: ['manage', 'user-detail'],
    path: '/admin/manage',
  },
  {
    description: 'Catalog, pricing, and visibility',
    icon: Package,
    key: 'iap',
    label: 'IAP',
    matches: ['iap', 'bank-hook-history'],
    path: '/admin/iap',
  },
]

export default function AdminLayout({ routeName, title, user, children, headerActions, onNavigate, onLogout }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const hasSidebar = true
  const sidebarFooterLabel = user ? 'Signed in as admin' : 'Sign in to continue'

  const handleLogout = async () => {
    await logoutCurrentSession()
    setIsMenuOpen(false)
    onLogout()
  }

  return (
    <div className={`admin-app-shell${hasSidebar ? ' admin-app-shell-sidebar' : ''}`}>
      {hasSidebar && (
        <aside className="admin-sidebar dev-host">
          <DeveloperMarker code="admin.react.sidebar" title="Admin React Sidebar" />
          <button type="button" className="brand-button admin-sidebar-brand" onClick={() => onNavigate('/admin/manage')}>
            <span className="brand-icon"><Shield size={20} /></span>
            <span>
              <strong>VideoForge Admin</strong>
              <span>Operations console</span>
            </span>
          </button>

          <nav className="admin-sidebar-nav" aria-label="Admin sections">
            {NAVIGATION_ITEMS.map((item) => {
              const Icon = item.icon
              const isActive = item.matches.includes(routeName)
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`admin-sidebar-link${isActive ? ' admin-sidebar-link-active' : ''}`}
                  onClick={() => onNavigate(item.path)}
                >
                  <span className="admin-sidebar-link-icon"><Icon size={18} /></span>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                </button>
              )
            })}
          </nav>

          <div className="admin-sidebar-footer">
            <span>{getIdentityLabel(user)}</span>
            <small>{sidebarFooterLabel}</small>
          </div>
        </aside>
      )}

      <div className="admin-shell-main">
        <header className="admin-topbar dev-host">
          <DeveloperMarker code="admin.react.header" title="Admin React Header" />
          {hasSidebar ? (
            <div className="admin-topbar-heading">
              <p>Admin console</p>
              <strong>{title}</strong>
            </div>
          ) : (
            <button type="button" className="brand-button" onClick={() => onNavigate(user ? '/admin/manage' : '/admin/login')}>
              <span className="brand-icon"><Shield size={20} /></span>
              <span>
                <strong>VideoForge Admin</strong>
                <span>{title}</span>
              </span>
            </button>
          )}
          <div className="admin-topbar-tools">
            {headerActions ? <div className="admin-topbar-actions">{headerActions}</div> : null}
            <div className="account-menu">
              <button type="button" className="account-trigger" onClick={() => setIsMenuOpen((current) => !current)}>
                <UserCircle size={22} />
                <span>{getIdentityLabel(user)}</span>
              </button>
              {isMenuOpen && (
                <div className="account-dropdown">
                  <button type="button" onClick={() => window.location.reload()}>
                    <RefreshCw size={16} /> Refresh page
                  </button>
                  {user && (
                    <button type="button" className="danger-menu-item" onClick={() => void handleLogout()}>
                      <LogOut size={16} /> Logout
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="admin-main">{children}</main>
      </div>
    </div>
  )
}