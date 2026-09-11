import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { LoginPage } from './pages/Login'
import { OnboardingPage } from './pages/Onboarding'
import { DashboardPage } from './pages/Dashboard'
import { LearningPage } from './pages/Learning'
import { ResultPage } from './pages/Result'
import { AnswerPage } from './pages/Answer'
import { HistoryPage } from './pages/History'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

function RequireOnboarded({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  if (!profile?.onboarded) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { user, profile } = useAuth()

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
          user ? (
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
