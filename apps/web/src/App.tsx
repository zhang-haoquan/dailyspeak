import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { LoginPage } from './pages/Login'
import { OnboardingPage } from './pages/Onboarding'
import { DashboardPage } from './pages/Dashboard'
import { LearningPage } from './pages/Learning'
import { ResultPage } from './pages/Result'
import { AnswerPage } from './pages/Answer'
import { HistoryPage } from './pages/History'

/** 恢复登录态 / 加载画像期间的过渡页，避免闪现登录页 */
function Splash({ text }: { text: string }) {
  return (
    <div className="ds-center-page">
      <div className="flex items-center gap-3" style={{ color: 'var(--muted-foreground)' }}>
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">{text}</span>
      </div>
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Splash text="正在恢复登录状态…" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

function RequireOnboarded({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <Splash text="正在加载学习计划…" />
  if (!profile?.onboarded) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <Splash text="正在恢复登录状态…" />
  // 已登录但还没完成首次引导的，直接送去引导页（PRD 5.2）
  if (user) return <Navigate to={profile?.onboarded ? '/' : '/onboarding'} replace />
  return <>{children}</>
}

function AppRoutes() {
  const { user, profile, loading } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <RequireOnboarded>
              <DashboardPage />
            </RequireOnboarded>
          </RequireAuth>
        }
      />
      <Route
        path="/learn/:cardId"
        element={
          <RequireAuth>
            <RequireOnboarded>
              <LearningPage />
            </RequireOnboarded>
          </RequireAuth>
        }
      />
      <Route
        path="/result/:cardId"
        element={
          <RequireAuth>
            <RequireOnboarded>
              <ResultPage />
            </RequireOnboarded>
          </RequireAuth>
        }
      />
      <Route
        path="/learn/:cardId/answer"
        element={
          <RequireAuth>
            <RequireOnboarded>
              <AnswerPage />
            </RequireOnboarded>
          </RequireAuth>
        }
      />
      <Route
        path="/history"
        element={
          <RequireAuth>
            <RequireOnboarded>
              <HistoryPage />
            </RequireOnboarded>
          </RequireAuth>
        }
      />
      {/* 兜底重定向 */}
      <Route
        path="*"
        element={
          loading ? (
            <Splash text="正在恢复登录状态…" />
          ) : user ? (
            profile?.onboarded ? (
              <Navigate to="/" replace />
            ) : (
              <Navigate to="/onboarding" replace />
            )
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
