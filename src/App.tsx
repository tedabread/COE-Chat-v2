import { useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthGuard } from './components/AuthGuard'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { Home } from './pages/Home'
import { SettingsPage } from './pages/SettingsPage'
import { UserRedirect } from './pages/UserRedirect'
import { NotFound } from './pages/NotFound'
import { useAuth } from './hooks/useAuth'
// import { DebugConsole } from './components/DebugConsole'
import { onAppReady } from './appReady'

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen">Loading...</div>
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

function LoaderManager() {
  const { loading, user } = useAuth()
  const hiddenRef = useRef(false)

  useEffect(() => {
    if (hiddenRef.current) return
    if (loading) return

    if (!user) {
      hideLoader()
      return
    }

    onAppReady(() => {
      hideLoader()
    })
  }, [loading, user])

  function hideLoader() {
    if (hiddenRef.current) return
    hiddenRef.current = true
    const loader = document.getElementById('loader')
    if (loader) {
      loader.classList.add('hidden')
      setTimeout(() => {
        loader.remove()
        document.body.style.removeProperty('background')
      }, 350)
    }
  }

  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <LoaderManager />
      <Routes>
        <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
        <Route path="/signup" element={<GuestRoute><Signup /></GuestRoute>} />
        <Route path="/settings" element={<AuthGuard><SettingsPage /></AuthGuard>} />
        <Route path="/invite/:serverId" element={<AuthGuard><UserRedirect /></AuthGuard>} />
        <Route path="/:identifier" element={<AuthGuard><UserRedirect /></AuthGuard>} />
        <Route element={<AuthGuard><Home /></AuthGuard>}>
          <Route index element={<></>} />
          <Route path="chat/:id" element={<></>} />
          <Route path="server/:serverId/channel/:channelId" element={<></>} />
          <Route path="server/:serverId" element={<></>} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      {/* <DebugConsole /> */}
    </BrowserRouter>
  )
}
