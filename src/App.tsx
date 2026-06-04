import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import AppRouter from '@/routers'

function App() {
  const checkAuth = useAuth((state) => state.checkAuth)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    void checkAuth().finally(() => setBooting(false))
  }, [checkAuth])

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] text-sm text-muted">
        Đang khởi tạo…
      </div>
    )
  }

  return <AppRouter />
}

export default App
