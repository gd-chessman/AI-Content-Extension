import { useEffect, useState, type ReactNode } from 'react'
import { FaFacebookF } from 'react-icons/fa6'
import { RiAdminFill } from 'react-icons/ri'
import { SiGooglesheets, SiOpenai, SiX } from 'react-icons/si'
import ExtensionLayout from '../layouts/ExtensionLayout'
import { useAuth } from '../hooks/useAuth'
import { getCachedSettings } from '../services/SettingsService'
import ChatgptScreen from '../screens/ChatgptScreen'
import FacebookScreen from '../screens/FacebookScreen'
import GgSheetScreen from '../screens/GgSheetScreen'
import GrokScreen from '../screens/GrokScreen'
import LoginScreen from '../screens/LoginScreen'
import ProfileScreen from '../screens/ProfileScreen'
import WebAdminScreen from '../screens/WebAdminScreen'

type RouteId = 'login' | 'profile' | 'facebook' | 'chatgpt' | 'grok' | 'webadmin' | 'ggsheet'
type BrowserTab = { id?: number; url?: string; active?: boolean }
type ExtensionChrome = {
  tabs?: {
    query?: (
      queryInfo: { url?: string[]; currentWindow?: boolean; active?: boolean },
      callback: (tabs: BrowserTab[]) => void,
    ) => void
    create?: (createProperties: { url: string; active?: boolean }, callback?: (tab: BrowserTab) => void) => void
    update?: (tabId: number, updateProperties: { url?: string; active?: boolean }, callback?: (tab: BrowserTab) => void) => void
  }
}

const mainTabs: Array<{
  id: Exclude<RouteId, 'login' | 'profile'>
  label: string
  icon: ReactNode
  iconClassName: string
}> = [
  { id: 'facebook', label: 'Facebook', icon: <FaFacebookF />, iconClassName: 'text-blue-500' },
  { id: 'chatgpt', label: 'ChatGPT', icon: <SiOpenai />, iconClassName: 'text-emerald-400' },
  { id: 'grok', label: 'Grok', icon: <SiX />, iconClassName: 'text-white' },
  { id: 'webadmin', label: 'WebAdmin', icon: <RiAdminFill />, iconClassName: 'text-amber-400' },
  { id: 'ggsheet', label: 'GGSheet', icon: <SiGooglesheets />, iconClassName: 'text-green-500' },
]

function AppRouter() {
  const [activeRoute, setActiveRoute] = useState<RouteId>('login')
  const isAuthenticated = useAuth((state) => state.isAuthenticated)
  const checkAuth = useAuth((state) => state.checkAuth)

  const syncBrowserTabByRoute = (routeId: Exclude<RouteId, 'login'>) => {
    const settings = getCachedSettings()
    const webadminUrl = (settings.adminPath || '').trim()
    const ggSheetUrl = (settings.ggSheetPath || '').trim()
    const toPattern = (url: string) => {
      try {
        const parsed = new URL(url)
        return `${parsed.origin}/*`
      } catch {
        return url
      }
    }
    const normalizeUrl = (url: string) => {
      const value = (url || '').trim()
      if (!value) return ''
      return value.replace(/\/+$/, '')
    }
    const targetByRoute: Partial<Record<Exclude<RouteId, 'login'>, { url: string; patterns: string[] }>> = {
      facebook: { url: 'https://www.facebook.com/', patterns: ['*://*.facebook.com/*'] },
      chatgpt: { url: 'https://chatgpt.com/', patterns: ['*://chatgpt.com/*', '*://chat.openai.com/*'] },
      grok: { url: 'https://grok.com/imagine/saved', patterns: ['*://grok.com/imagine*'] },
      ...(webadminUrl
        ? {
            webadmin: {
              url: webadminUrl,
              patterns: [toPattern(webadminUrl)],
            },
          }
        : {}),
      ...(ggSheetUrl
        ? {
            ggsheet: {
              url: ggSheetUrl,
              patterns: [toPattern(ggSheetUrl)],
            },
          }
        : {}),
    }
    const target = targetByRoute[routeId]
    if (!target) return

    const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome
    if (!extensionChrome?.tabs?.query || !extensionChrome.tabs.update || !extensionChrome.tabs.create) return

    extensionChrome.tabs.query({ url: target.patterns, currentWindow: true }, (tabs) => {
      const existing = tabs.find((tab) => tab.active && tab.id) || tabs.find((tab) => tab.id)
      if (existing?.id) {
        const isSameUrl = normalizeUrl(existing.url || '') === normalizeUrl(target.url)
        if (isSameUrl) {
          extensionChrome.tabs?.update?.(existing.id, { active: true })
          return
        }
        extensionChrome.tabs?.update?.(existing.id, { url: target.url, active: true })
        return
      }
      extensionChrome.tabs?.create?.({ url: target.url, active: true })
    })
  }

  useEffect(() => {
    const bootstrapAuth = async () => {
      if (isAuthenticated) {
        setActiveRoute('facebook')
      }
      const ok = await checkAuth()
      setActiveRoute(ok ? 'facebook' : 'login')
    }
    void bootstrapAuth()
  }, [checkAuth, isAuthenticated])

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ tabId?: RouteId }>
      const tabId = custom.detail?.tabId
      if (!tabId || tabId === 'login') return
      setActiveRoute(tabId)
    }

    window.addEventListener('switch-main-tab', handler as EventListener)
    return () => window.removeEventListener('switch-main-tab', handler as EventListener)
  }, [])

  if (activeRoute === 'login') {
    return (
      <ExtensionLayout showProfileButton={false}>
        <LoginScreen onLoginSuccess={() => setActiveRoute('facebook')} />
      </ExtensionLayout>
    )
  }

  const routeContent: Record<Exclude<RouteId, 'login'>, ReactNode> = {
    profile: <ProfileScreen onLogout={() => setActiveRoute('login')} />,
    facebook: <FacebookScreen />,
    chatgpt: <ChatgptScreen />,
    grok: <GrokScreen />,
    webadmin: <WebAdminScreen />,
    ggsheet: <GgSheetScreen />,
  }

  return (
    <ExtensionLayout
      bottomTabs={mainTabs}
      activeTabId={activeRoute}
      onProfileClick={() => setActiveRoute('profile')}
      onTabChange={(tabId) => {
        const routeId = tabId as Exclude<RouteId, 'login'>
        setActiveRoute(routeId)
        if (routeId !== 'profile') {
          syncBrowserTabByRoute(routeId)
        }
      }}
    >
      {(Object.keys(routeContent) as Array<Exclude<RouteId, 'login'>>).map((routeId) => (
        <div key={routeId} className={activeRoute === routeId ? 'h-full' : 'hidden h-full'}>
          {routeContent[routeId]}
        </div>
      ))}
    </ExtensionLayout>
  )
}

export default AppRouter
