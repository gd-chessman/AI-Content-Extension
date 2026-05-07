import { useEffect, useState, type ReactNode } from 'react'
import { FaFacebookF } from 'react-icons/fa6'
import { RiAdminFill } from 'react-icons/ri'
import { SiGooglesheets, SiOpenai, SiX } from 'react-icons/si'
import ExtensionLayout from '../layouts/ExtensionLayout'
import ChatgptScreen from '../screens/ChatgptScreen'
import FacebookScreen from '../screens/FacebookScreen'
import GgSheetScreen from '../screens/GgSheetScreen'
import GrokScreen from '../screens/GrokScreen'
import LoginScreen from '../screens/LoginScreen'

type RouteId = 'login' | 'facebook' | 'chatgpt' | 'grok' | 'webadmin' | 'ggsheet'
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
  id: Exclude<RouteId, 'login'>
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

function PlaceholderScreen({ title }: { title: string }) {
  return (
    <section className="flex h-full items-center justify-center rounded-3xl bg-slate-800 p-4 text-center">
      <p className="text-sm font-semibold text-slate-200">{title} - Đang phát triển</p>
    </section>
  )
}

function AppRouter() {
  const [activeRoute, setActiveRoute] = useState<RouteId>('facebook')

  const syncBrowserTabByRoute = (routeId: Exclude<RouteId, 'login'>) => {
    const targetByRoute: Partial<Record<Exclude<RouteId, 'login'>, { url: string; patterns: string[] }>> = {
      facebook: { url: 'https://www.facebook.com/', patterns: ['*://*.facebook.com/*'] },
      chatgpt: { url: 'https://chatgpt.com/', patterns: ['*://chatgpt.com/*', '*://chat.openai.com/*'] },
      grok: { url: 'https://grok.com/imagine/saved', patterns: ['*://grok.com/imagine*'] },
      ggsheet: { url: 'https://docs.google.com/spreadsheets/', patterns: ['*://docs.google.com/spreadsheets/*'] },
    }
    const target = targetByRoute[routeId]
    if (!target) return

    const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome
    if (!extensionChrome?.tabs?.query || !extensionChrome.tabs.update || !extensionChrome.tabs.create) return

    extensionChrome.tabs.query({ url: target.patterns, currentWindow: true }, (tabs) => {
      const existing = tabs.find((tab) => tab.active && tab.id) || tabs.find((tab) => tab.id)
      if (existing?.id) {
        extensionChrome.tabs?.update?.(existing.id, { active: true })
        return
      }
      extensionChrome.tabs?.create?.({ url: target.url, active: true })
    })
  }

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
      <ExtensionLayout>
        <LoginScreen />
      </ExtensionLayout>
    )
  }

  const routeContent: Record<Exclude<RouteId, 'login'>, ReactNode> = {
    facebook: <FacebookScreen />,
    chatgpt: <ChatgptScreen />,
    grok: <GrokScreen />,
    webadmin: <PlaceholderScreen title="WebAdmin" />,
    ggsheet: <GgSheetScreen />,
  }

  return (
    <ExtensionLayout
      bottomTabs={mainTabs}
      activeTabId={activeRoute}
      onTabChange={(tabId) => {
        const routeId = tabId as Exclude<RouteId, 'login'>
        setActiveRoute(routeId)
        syncBrowserTabByRoute(routeId)
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
