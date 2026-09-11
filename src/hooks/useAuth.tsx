import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { User, UserProfile } from '../types'
import * as api from '../services/api'

interface AuthState {
  user: User | null
  profile: UserProfile | null
  login: (account: string, password: string) => string | null
  register: (account: string, password: string) => string | null
  logout: () => void
  saveProfile: (domains: UserProfile['domains'], dailyCount: number) => void
  refreshProfile: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => api.getSessionUser())
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const u = api.getSessionUser()
    return u ? api.getProfile(u.id) : null
  })

  const login = useCallback((account: string, password: string) => {
    const res = api.login(account, password)
    if ('message' in res) return res.message
    setUser(res.user)
    setProfile(api.getProfile(res.user.id))
    return null
  }, [])

  const register = useCallback((account: string, password: string) => {
    const res = api.register(account, password)
    if ('message' in res) return res.message
    setUser(res.user)
    setProfile(null)
    return null
  }, [])

  const logout = useCallback(() => {
    api.logout()
    setUser(null)
    setProfile(null)
  }, [])

  const saveProfile = useCallback(
    (domains: UserProfile['domains'], dailyCount: number) => {
      if (!user) return
      const p = api.saveProfile(user.id, domains, dailyCount)
      setProfile(p)
    },
    [user],
  )

  const refreshProfile = useCallback(() => {
    const u = api.getSessionUser()
    if (!u) return
    setUser(u)
    setProfile(api.getProfile(u.id))
  }, [])

  const value = useMemo(
    () => ({ user, profile, login, register, logout, saveProfile, refreshProfile }),
    [user, profile, login, register, logout, saveProfile, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}
