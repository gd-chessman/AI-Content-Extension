import { useEffect, useState, type ReactNode } from 'react'

type ChromeWindow = { id?: number }
type RuntimeContext = { contextType?: string; windowId?: number }
type ExtensionChrome = {
  runtime: {
    lastError?: { message?: string }
    getContexts?: (
      filter: { contextTypes: string[] },
      callback: (contexts: RuntimeContext[]) => void,
    ) => void
  }
  windows: {
    getCurrent: (callback: (window: ChromeWindow) => void) => void
  }
  sidePanel: {
    open: (options: { windowId: number }, callback: () => void) => void
  }
}

type ExtensionLayoutProps = {
  children: ReactNode
  bottomTabs?: Array<{
    id: string
    label: string
    icon?: ReactNode
    iconClassName?: string
  }>
  activeTabId?: string
  onTabChange?: (tabId: string) => void
  onProfileClick?: () => void
  showProfileButton?: boolean
}

export default function ExtensionLayout({
  children,
  bottomTabs = [],
  activeTabId,
  onTabChange,
  onProfileClick,
  showProfileButton = true,
}: ExtensionLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome

    if (!extensionChrome?.windows?.getCurrent || !extensionChrome.runtime?.getContexts) {
      return
    }

    extensionChrome.windows.getCurrent((currentWindow) => {
      if (!currentWindow.id) {
        return
      }

      extensionChrome.runtime.getContexts?.({ contextTypes: ['SIDE_PANEL'] }, (contexts) => {
        const sidePanelOpened = contexts.some(
          (context) =>
            context.contextType === 'SIDE_PANEL' &&
            (context.windowId === undefined || context.windowId === currentWindow.id),
        )

        setIsSidebarOpen(sidePanelOpened)
      })
    })
  }, [])

  const openSidebar = () => {
    const extensionChrome = (globalThis as { chrome?: ExtensionChrome }).chrome

    if (isSidebarOpen) return

    if (!extensionChrome?.sidePanel?.open || !extensionChrome.windows?.getCurrent) {
      return
    }

    extensionChrome.windows.getCurrent((currentWindow) => {
      if (!currentWindow.id) {
        return
      }

      extensionChrome.sidePanel.open({ windowId: currentWindow.id }, () => {
        if (extensionChrome.runtime?.lastError?.message) {
          return
        }

        setIsSidebarOpen(true)
        window.close()
      })
    })
  }

  return (
    <main className="relative flex h-[100dvh] w-full min-w-[390px] min-h-[620px] items-center justify-center bg-[var(--app-bg)] p-1.5 text-[var(--app-text)]">
      {showProfileButton ? (
        <button
          type="button"
          aria-label="Hồ sơ"
          title="Hồ sơ"
          onClick={onProfileClick}
          className="absolute left-4 top-4 z-10 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-[var(--app-border)] bg-white/10 text-slate-300 backdrop-blur transition hover:bg-white/20 active:border-blue-400 active:shadow-[0_0_0_2px_rgba(59,130,246,0.35)]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="3.2" />
            <path d="M5.5 19c1.8-3 4-4.3 6.5-4.3S16.7 16 18.5 19" />
          </svg>
        </button>
      ) : null}

      <button
        type="button"
        aria-label="Mở sidebar"
        title="Mở sidebar"
        onClick={openSidebar}
        disabled={isSidebarOpen}
        className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-[var(--app-border)] bg-white/10 text-blue-300 backdrop-blur transition enabled:hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
          <path d="M15 4.5v15" />
        </svg>
      </button>

      <section className="glass-panel flex h-full w-full min-w-[390px] flex-col rounded-2xl p-4 pt-14 shadow-2xl shadow-black/40">
        <div className="min-h-0 flex-1">{children}</div>
        {bottomTabs.length > 0 ? (
          <nav className="mt-3 grid grid-cols-5 gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur">
            {bottomTabs.map((tab) => {
              const isActive = activeTabId === tab.id

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange?.(tab.id)}
                  className={`cursor-pointer rounded-xl py-1.5 transition ${
                    isActive ? 'bg-blue-500/20 text-blue-300' : 'text-slate-400 hover:bg-white/10'
                  }`}
                >
                  <span className="flex flex-col items-center justify-center gap-0.5">
                    <span className={`text-base leading-none ${tab.iconClassName || ''}`}>{tab.icon || '◻︎'}</span>
                    <span className="text-[10px] font-medium leading-none">{tab.label}</span>
                  </span>
                </button>
              )
            })}
          </nav>
        ) : null}
      </section>
    </main>
  )
}
