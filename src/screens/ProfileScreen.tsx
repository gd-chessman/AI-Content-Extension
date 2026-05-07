import { useState } from 'react'

export default function ProfileScreen() {
  const [activeTab, setActiveTab] = useState<'overview' | 'config'>('overview')

  return (
    <section className="glass-panel flex h-full min-h-0 flex-col rounded-3xl p-3">
      <h2 className="text-sm font-semibold text-white">Hồ sơ</h2>

      <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl border border-white/10 bg-white/5 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`cursor-pointer rounded-lg px-2 py-2 text-xs font-semibold transition ${
            activeTab === 'overview' ? 'primary-blue-btn' : 'text-slate-300 hover:bg-white/10'
          }`}
        >
          Tổng quan
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('config')}
          className={`cursor-pointer rounded-lg px-2 py-2 text-xs font-semibold transition ${
            activeTab === 'config' ? 'primary-blue-btn' : 'text-slate-300 hover:bg-white/10'
          }`}
        >
          Cấu hình
        </button>
      </div>

      <div className="mt-3 min-h-0 flex-1 rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-slate-300">
        {activeTab === 'overview' ? (
          <div className="space-y-2">
            <p className="font-semibold text-slate-100">Tổng quan</p>
            <p>Hiển thị thông tin tài khoản và trạng thái sử dụng extension.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="font-semibold text-slate-100">Cấu hình</p>
            <p>Hiển thị các tuỳ chỉnh hệ thống và cá nhân hoá.</p>
          </div>
        )}
      </div>
    </section>
  )
}
