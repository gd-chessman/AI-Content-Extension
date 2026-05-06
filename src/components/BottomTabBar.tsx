const tabs = ['Facebook', 'ChatGPT', 'Grok', 'Admin', 'Excel']

export default function BottomTabBar() {
  return (
    <nav className="mt-6 grid grid-cols-5 gap-2 rounded-xl bg-slate-100 p-2">
      {tabs.map((tab, index) => (
        <button
          key={tab}
          type="button"
          className={`cursor-pointer rounded-lg px-2 py-2 text-xs font-medium ${
            index === 0
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:bg-white/70'
          }`}
        >
          {tab}
        </button>
      ))}
    </nav>
  )
}

