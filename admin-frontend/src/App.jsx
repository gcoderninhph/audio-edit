import { useCallback, useEffect, useMemo, useState } from 'react'
import { clearStoredSession, getStoredSession, resolveAdminDestination, syncCurrentUser } from './api/adminApi'
import AdminLayout from './components/AdminLayout'
import IapPage from './components/IapPage'
import LoginPage from './components/LoginPage'
import ManagePage from './components/ManagePage'
import ServicePage from './components/ServicePage'
import SetupPage from './components/SetupPage'
import UserDetailPage from './components/UserDetailPage'
import './App.css'

const IAP_TABS = new Set(['packages', 'api-key', 'payment-tools', 'sale'])
const SERVICE_TABS = new Set(['openai', 'vbee'])
const VBEE_SECTIONS = new Set(['tokens', 'requests', 'segments', 'config'])
const OPENAI_SECTIONS = new Set(['tokens', 'requests', 'usage', 'test', 'config'])

function parseIapRoute(normalizedPath) {
  if (normalizedPath === '/admin/iap/pack-function') {
    return { name: 'iap', iapTab: 'packages', paymentToolSection: '' }
  }

  const historyDetailMatch = normalizedPath.match(/^\/admin\/iap\/payment-tools\/history\/(\d+)$/)
  if (historyDetailMatch) {
    return {
      name: 'iap',
      iapTab: 'payment-tools',
      paymentToolHistoryId: Number(historyDetailMatch[1]),
      paymentToolSection: 'history',
    }
  }

  const transactionDetailMatch = normalizedPath.match(/^\/admin\/iap\/payment-tools\/transactions\/(\d+)$/)
  if (transactionDetailMatch) {
    return {
      name: 'iap',
      iapTab: 'payment-tools',
      paymentToolSection: 'transactions',
      paymentTransactionId: Number(transactionDetailMatch[1]),
    }
  }

  if (normalizedPath === '/admin/iap/bank-hook-history') {
    return { name: 'iap', iapTab: 'payment-tools', paymentToolSection: 'history' }
  }

  const legacyBankHookHistoryDetailMatch = normalizedPath.match(/^\/admin\/iap\/bank-hook-history\/(\d+)$/)
  if (legacyBankHookHistoryDetailMatch) {
    return {
      name: 'iap',
      iapTab: 'payment-tools',
      paymentToolHistoryId: Number(legacyBankHookHistoryDetailMatch[1]),
      paymentToolSection: 'history',
    }
  }

  const paymentToolSectionMatch = normalizedPath.match(/^\/admin\/iap\/payment-tools\/(transactions|beneficiaries|refunds|history)$/)
  if (paymentToolSectionMatch) {
    return { name: 'iap', iapTab: 'payment-tools', paymentToolSection: paymentToolSectionMatch[1] }
  }

  const iapTabMatch = normalizedPath.match(/^\/admin\/iap\/([^/]+)$/)
  if (iapTabMatch && IAP_TABS.has(iapTabMatch[1])) {
    return {
      name: 'iap',
      iapTab: iapTabMatch[1],
      paymentToolSection: iapTabMatch[1] === 'payment-tools' ? 'transactions' : '',
    }
  }

  if (normalizedPath === '/admin/iap') {
    return { name: 'iap', iapTab: 'packages', paymentToolSection: '' }
  }

  return null
}

function parseAdminRoute(pathname = window.location.pathname) {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/admin'
  if (normalizedPath === '/admin' || normalizedPath === '/admin/login') return { name: 'login' }
  if (normalizedPath === '/admin/setup') return { name: 'setup' }

  const iapRoute = parseIapRoute(normalizedPath)
  if (iapRoute) return iapRoute

  const serviceRequestMatch = normalizedPath.match(/^\/admin\/service\/vbee\/requests\/(.+)$/)
  if (serviceRequestMatch) {
    return { name: 'service', serviceTab: 'vbee', vbeeRequestId: decodeURIComponent(serviceRequestMatch[1]), vbeeSection: 'requests' }
  }

  const serviceSegmentMatch = normalizedPath.match(/^\/admin\/service\/vbee\/segments\/(.+)$/)
  if (serviceSegmentMatch) {
    return { name: 'service', serviceTab: 'vbee', vbeeSegmentHash: decodeURIComponent(serviceSegmentMatch[1]), vbeeSection: 'segments' }
  }

  const openAiRequestMatch = normalizedPath.match(/^\/admin\/service\/openai\/requests\/(.+)$/)
  if (openAiRequestMatch) {
    return {
      name: 'service',
      serviceTab: 'openai',
      openAiRequestId: decodeURIComponent(openAiRequestMatch[1]),
      openAiSection: 'requests',
    }
  }

  const serviceSectionMatch = normalizedPath.match(/^\/admin\/service\/vbee\/([^/]+)$/)
  if (serviceSectionMatch && VBEE_SECTIONS.has(serviceSectionMatch[1])) {
    return { name: 'service', serviceTab: 'vbee', vbeeSection: serviceSectionMatch[1] }
  }

  const openAiSectionMatch = normalizedPath.match(/^\/admin\/service\/openai\/([^/]+)$/)
  if (openAiSectionMatch && OPENAI_SECTIONS.has(openAiSectionMatch[1])) {
    return { name: 'service', serviceTab: 'openai', openAiSection: openAiSectionMatch[1] }
  }

  const serviceTabMatch = normalizedPath.match(/^\/admin\/service\/([^/]+)$/)
  if (serviceTabMatch && SERVICE_TABS.has(serviceTabMatch[1])) {
    if (serviceTabMatch[1] === 'openai') {
      return { name: 'service', serviceTab: 'openai', openAiSection: 'tokens' }
    }
    return { name: 'service', serviceTab: 'vbee', vbeeSection: 'tokens' }
  }

  if (normalizedPath === '/admin/service') {
    return { name: 'service', serviceTab: 'vbee', vbeeSection: 'tokens' }
  }

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
  const [headerActions, setHeaderActions] = useState(null)
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
    setHeaderActions(null)
  }, [route.name])

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
    if (route.name === 'iap') {
      if (route.iapTab === 'api-key') return 'IAP API keys'
      if (route.iapTab === 'payment-tools' && route.paymentToolHistoryId) return 'Bank hook transaction'
      if (route.iapTab === 'payment-tools' && route.paymentTransactionId) return 'Payment transaction'
      if (route.iapTab === 'payment-tools') return 'IAP payment tools'
      if (route.iapTab === 'sale') return 'IAP sales'
      return 'IAP packages'
    }
    if (route.name === 'service') {
      if (route.serviceTab === 'openai') {
        if (route.openAiRequestId) return 'OpenAI request'
        if (route.openAiSection === 'requests') return 'OpenAI requests'
        if (route.openAiSection === 'usage') return 'OpenAI token usage'
        if (route.openAiSection === 'test') return 'OpenAI test'
        if (route.openAiSection === 'config') return 'OpenAI config'
        return 'OpenAI tokens'
      }
      if (route.vbeeRequestId) return 'Vbee request'
      if (route.vbeeSegmentHash) return 'Vbee segment'
      if (route.vbeeSection === 'requests') return 'Vbee requests'
      if (route.vbeeSection === 'segments') return 'Vbee segments'
      if (route.vbeeSection === 'config') return 'Vbee config'
      return 'Vbee tokens'
    }
    if (route.name === 'user-detail') return 'User detail'
    if (route.name === 'manage') return 'User management'
    return 'Admin login'
  }, [route.iapTab, route.name, route.openAiRequestId, route.openAiSection, route.paymentToolHistoryId, route.paymentTransactionId, route.serviceTab, route.vbeeRequestId, route.vbeeSection, route.vbeeSegmentHash])

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
    <AdminLayout routeName={route.name} title={layoutTitle} user={signedInUser} headerActions={headerActions} onNavigate={navigate} onLogout={handleLogout}>
      {notice && <div className="notice notice-info">{notice}</div>}
      {route.name === 'setup' && <SetupPage onComplete={handleSessionUpdate} />}
      {route.name === 'iap' && <IapPage route={route} onHeaderActionsChange={setHeaderActions} onNavigate={navigate} />}
      {route.name === 'service' && <ServicePage route={route} onHeaderActionsChange={setHeaderActions} onNavigate={navigate} />}
      {route.name === 'manage' && <ManagePage onNavigate={navigate} onHeaderActionsChange={setHeaderActions} />}
      {route.name === 'user-detail' && <UserDetailPage userId={route.userId} onNavigate={navigate} onHeaderActionsChange={setHeaderActions} />}
      {route.name === 'login' && <LoginPage onLogin={handleSessionUpdate} initialNotice={notice} />}
    </AdminLayout>
  )
}

export default App
