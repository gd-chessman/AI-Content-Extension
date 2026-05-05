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
}

export default function ExtensionLayout({ children }: ExtensionLayoutProps) {
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
    <main className="relative flex h-[100dvh] w-full min-w-[390px] min-h-[620px] items-center justify-center bg-slate-950 p-2 text-slate-100">
      <button
        type="button"
        aria-label="Mở sidebar"
        title="Mở sidebar"
        onClick={openSidebar}
        disabled={isSidebarOpen}
        className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-violet-400/40 bg-violet-500/15 text-violet-200 backdrop-blur transition enabled:hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-40"
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

      <section className="flex h-full w-full min-w-[390px] flex-col rounded-[28px] border border-slate-800 bg-slate-900/95 p-4 pt-14 shadow-2xl shadow-black/40">
        <div className="min-h-0 flex-1">{children}</div>
      </section>
    </main>
  )
}
