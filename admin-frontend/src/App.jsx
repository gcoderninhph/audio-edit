import { useCallback, useEffect, useMemo, useState } from 'react'
import { clearStoredSession, getStoredSession, resolveAdminDestination, syncCurrentUser } from './api/adminApi'
import AdminLayout from './components/AdminLayout'
import LoginPage from './components/LoginPage'
import ManagePage from './components/ManagePage'
import SetupPage from './components/SetupPage'
import UserDetailPage from './components/UserDetailPage'
import './App.css'

function parseAdminRoute(pathname = window.location.pathname) {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/admin'
  if (normalizedPath === '/admin' || normalizedPath === '/admin/login') return { name: 'login' }
  if (normalizedPath === '/admin/setup') return { name: 'setup' }
  if (normalizedPath === '/admin/manage' || normalizedPath === '/console') return { name: 'manage' }

  const userMatch = normalizedPath.match(/^\/admin\/users\/(.+)$/)
  if (userMatch) {
    return { name: 'user-detail', userId: decodeURIComponent(userMatch[1]) }
  }
  return { name: 'login' }
}

function App() {
  const [route, setRoute] = useState(() => parseAdminRoute())
  const [session, setSession] = useState(() => getStoredSession())
  const [sessionStatus, setSessionStatus] = useState('checking')
  const [notice, setNotice] = useState('')

  const navigate = useCallback((path) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path)
    }
    setRoute(parseAdminRoute(path))
  }, [])

  const signedInUser = session?.user || null
  const isAdmin = signedInUser?.role === 'admin'
  const mustSetupAdmin = Boolean(signedInUser?.mustSetupAdmin)

  useEffect(() => {
    const handlePopState = () => setRoute(parseAdminRoute())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    let isCancelled = false
    async function verifySession() {
      try {
        const currentSession = await syncCurrentUser()
        if (!isCancelled) setSession(currentSession)
      } finally {
        if (!isCancelled) setSessionStatus('ready')
      }
    }
    void verifySession()
    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (sessionStatus !== 'ready') return
    if (!session && route.name !== 'login') {
      navigate('/admin/login')
      return
    }
    if (session && route.name === 'login') {
      navigate(resolveAdminDestination(session))
      return
    }
    if (mustSetupAdmin && route.name !== 'setup') {
      navigate('/admin/setup')
      return
    }
    if (session && !mustSetupAdmin && !isAdmin) {
      clearStoredSession()
      setSession(null)
      setNotice('This account does not have admin access.')
      navigate('/admin/login')
    }
  }, [isAdmin, mustSetupAdmin, navigate, route.name, session, sessionStatus])

  const layoutTitle = useMemo(() => {
    if (route.name === 'setup') return 'Admin setup'
    if (route.name === 'user-detail') return 'User detail'
    if (route.name === 'manage') return 'User management'
    return 'Admin login'
  }, [route.name])

  const handleSessionUpdate = (nextSession) => {
    setSession(nextSession)
    setNotice('')
    navigate(resolveAdminDestination(nextSession))
  }

  const handleLogout = () => {
    clearStoredSession()
    setSession(null)
    setNotice('Logged out successfully.')
    navigate('/admin/login')
  }

  if (sessionStatus === 'checking') {
    return <div className="admin-loading">Checking admin session...</div>
  }

  return (
    <AdminLayout title={layoutTitle} user={signedInUser} onNavigate={navigate} onLogout={handleLogout}>
      {notice && <div className="notice notice-info">{notice}</div>}
      {route.name === 'setup' && <SetupPage onComplete={handleSessionUpdate} />}
      {route.name === 'manage' && <ManagePage onNavigate={navigate} />}
      {route.name === 'user-detail' && <UserDetailPage userId={route.userId} onNavigate={navigate} />}
      {route.name === 'login' && <LoginPage onLogin={handleSessionUpdate} initialNotice={notice} />}
    </AdminLayout>
  )
}

export default App
