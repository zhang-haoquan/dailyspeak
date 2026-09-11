import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AuthUser, Domain, MeResponse, UserProfile } from '@dailyspeak/shared'
import { supabase } from '../services/supabase'
import { authedFetch } from '../services/http'

export type AuthResult =
  | { ok: true; needsEmailConfirmation: boolean }
  | { ok: false; error: string }

interface AuthState {
  /** 首次恢复会话期间为 true，避免「还没查完就把用户踢到登录页」 */
  loading: boolean
  user: AuthUser | null
  profile: UserProfile | null
  login(email: string, password: string): Promise<AuthResult>
  register(email: string, password: string): Promise<AuthResult>
  logout(): Promise<void>
  /** 保存学习计划（PRD 5.2），成功后同步本地 profile */
  saveProfile(domains: Domain[], dailyCount: number): Promise<void>
  /** 重新拉取登录用户与画像 */
  reload(): Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/** 把 Supabase 的英文报错翻成用户能看懂的中文 */
export function translateAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return '邮箱或密码不正确'
  if (m.includes('email not confirmed')) return '邮箱还没验证，请先点击验证邮件里的链接'
  if (m.includes('already registered') || m.includes('already been registered'))
    return '该邮箱已注册，请直接登录'
  if (m.includes('rate limit') || m.includes('too many') || m.includes('for security purposes'))
    return '操作过于频繁，请稍后再试'
  if (m.includes('password')) return '密码不符合要求：至少 8 位，需包含大小写字母和数字'
  if (m.includes('email')) return '邮箱格式不正确'
  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)

  const loadMe = useCallback(async (): Promise<void> => {
    const me = await authedFetch<MeResponse>('/auth/me')
    setUser(me.user)
    setProfile(me.profile)
  }, [])

  const clear = useCallback(() => {
    setUser(null)
    setProfile(null)
  }, [])

  useEffect(() => {
    let cancelled = false

    // onAuthStateChange 挂载时就会以 INITIAL_SESSION 回调一次，
    // 因此「恢复已有会话」与「后续登录/登出/令牌刷新」可以共用同一段逻辑。
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return

      if (event === 'SIGNED_OUT' || !session) {
        clear()
        setLoading(false)
        return
      }

      void loadMe()
        .catch(() => clear())
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [loadMe, clear])

  const login = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) return { ok: false, error: translateAuthError(error.message) }

      // 主动加载一次，避免路由跳转时 profile 尚未就绪
      if (data.session) {
        await loadMe().catch(() => undefined)
      }
      return { ok: true, needsEmailConfirmation: false }
    },
    [loadMe],
  )

  const register = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
    if (error) return { ok: false, error: translateAuthError(error.message) }

    // 开启邮箱确认（决策 D-022）时 signUp 不返回 session，用户需先点邮件里的链接
    return { ok: true, needsEmailConfirmation: !data.session }
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    await supabase.auth.signOut()
    // 清掉上一个账号的缓存，否则换号登录会先看到别人的今日任务/学习记录
    queryClient.clear()
    clear()
  }, [clear, queryClient])

  const saveProfile = useCallback(
    async (domains: Domain[], dailyCount: number): Promise<void> => {
      const saved = await authedFetch<UserProfile>('/profile', {
        method: 'PUT',
        body: { domains, dailyCount },
      })
      setProfile(saved)
      // 学习计划变了，服务端会作废今日快照；前端缓存也要跟着失效
      await queryClient.invalidateQueries({ queryKey: ['today'] })
    },
    [queryClient],
  )

  const reload = useCallback(async (): Promise<void> => {
    await loadMe().catch(() => clear())
  }, [loadMe, clear])

  const value = useMemo(
    () => ({ loading, user, profile, login, register, logout, saveProfile, reload }),
    [loading, user, profile, login, register, logout, saveProfile, reload],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}
