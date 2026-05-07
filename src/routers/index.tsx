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
      onTabChange={(tabId) => setActiveRoute(tabId as Exclude<RouteId, 'login'>)}
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
