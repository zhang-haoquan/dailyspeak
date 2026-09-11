import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Mail,
  Lock,
  ShieldCheck,
  UserPlus,
  LogIn,
  Loader2,
  Languages,
  Eye,
  EyeOff,
  CircleAlert,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { isEmailOrPhone, isStrongPassword } from '../services/api'

type Mode = 'login' | 'register'
type Field = 'account' | 'password' | 'confirm'
type FieldErrors = Partial<Record<Field, string>>

export function LoginPage() {
  const { login, register } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>('login')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isRegister = mode === 'register'

  const switchMode = (m: Mode) => {
    setMode(m)
    setFieldErrors({})
    setError(null)
    setPassword('')
    setConfirm('')
    setShowPassword(false)
  }

  /** PRD 5.1 字段规则：邮箱/手机号、密码强度、确认密码一致 —— 全部内联报错 */
  const validate = (): FieldErrors => {
    const next: FieldErrors = {}
    if (!account.trim()) next.account = '请输入邮箱或手机号'
    else if (!isEmailOrPhone(account.trim())) next.account = '请输入合法的邮箱或 11 位手机号'

    if (!password) next.password = isRegister ? '请设置密码' : '请输入密码'
    else if (isRegister && !isStrongPassword(password))
      next.password = '密码至少 8 位，需包含大小写字母和数字'

    if (isRegister) {
      if (!confirm) next.confirm = '请再次输入密码'
      else if (confirm !== password) next.confirm = '两次输入的密码不一致'
    }
    return next
  }

  /** 输入时清掉该字段的错误，避免「边输边红」 */
  const clearFieldError = (f: Field) => {
    setFieldErrors((prev) => (prev[f] ? { ...prev, [f]: undefined } : prev))
    setError(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError(null)

    const errs = validate()
    setFieldErrors(errs)
    if (Object.keys(errs).some((k) => errs[k as Field])) return

    setSubmitting(true)
    // 模拟网络延迟
    await new Promise((r) => setTimeout(r, 450))
    const err = isRegister
      ? register(account.trim(), password)
      : login(account.trim(), password)
    setSubmitting(false)
    if (err) {
      setError(err)
      return
    }
    // 首次注册 → 引导页；已登录 → 学习台
    if (isRegister) navigate('/onboarding', { replace: true })
    else navigate('/', { replace: true })
  }

  const inputClass = (f: Field) => `ds-input${fieldErrors[f] ? ' ds-input-invalid' : ''}`

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: 'var(--gradient-soft)' }}
    >
      <div
        className="ds-login-card"
        style={{
          width: '100%',
          maxWidth: '28rem',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-lg)',
          padding: '40px 32px',
        }}
      >
        {/* 品牌 */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="ds-brand-badge mb-4">
            <Languages size={28} />
          </div>
          <span className="ds-wordmark">DailySpeak</span>
        </div>

        {/* 标题 */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>
            {isRegister ? '创建账号' : '欢迎回来'}
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--muted-foreground)' }}>
            {isRegister ? '注册即进入引导，2 分钟完成设置' : '每天 5 分钟，练就流利职场英语'}
          </p>
        </div>

        {/* 表单 */}
        <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor="account" className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              邮箱或手机号
            </label>
            <div className="ds-input-wrap">
              <Mail className="ds-input-icon" />
              <input
                id="account"
                name="account"
                type="text"
                inputMode="email"
                className={inputClass('account')}
                placeholder="请输入邮箱或手机号"
                autoComplete="username"
                autoFocus
                aria-invalid={!!fieldErrors.account}
                aria-describedby={fieldErrors.account ? 'account-error' : undefined}
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value)
                  clearFieldError('account')
                }}
                required
              />
            </div>
            {fieldErrors.account && (
              <p id="account-error" className="ds-field-error" role="alert">
                <CircleAlert size={14} />
                {fieldErrors.account}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              密码
            </label>
            <div className="ds-input-wrap has-toggle">
              <Lock className="ds-input-icon" />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                className={inputClass('password')}
                placeholder={isRegister ? '至少 8 位，含大小写字母和数字' : '请输入密码'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  clearFieldError('password')
                }}
                required
              />
              <button
                type="button"
                className="ds-input-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {fieldErrors.password && (
              <p id="password-error" className="ds-field-error" role="alert">
                <CircleAlert size={14} />
                {fieldErrors.password}
              </p>
            )}
          </div>

          {isRegister && (
            <div className="flex flex-col gap-2">
              <label htmlFor="confirm" className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                确认密码
              </label>
              <div className="ds-input-wrap">
                <ShieldCheck className="ds-input-icon" />
                <input
                  id="confirm"
                  name="confirm"
                  type="password"
                  className={inputClass('confirm')}
                  placeholder="再次输入密码"
                  autoComplete="new-password"
                  aria-invalid={!!fieldErrors.confirm}
                  aria-describedby={fieldErrors.confirm ? 'confirm-error' : undefined}
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value)
                    clearFieldError('confirm')
                  }}
                  required
                />
              </div>
              {fieldErrors.confirm && (
                <p id="confirm-error" className="ds-field-error" role="alert">
                  <CircleAlert size={14} />
                  {fieldErrors.confirm}
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="ds-form-error" role="alert">
              <CircleAlert size={16} style={{ flexShrink: 0 }} />
              {error}
            </p>
          )}

          <button
            type="submit"
            className="ds-btn-primary ds-btn-primary-lg mt-1"
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                处理中…
              </>
            ) : isRegister ? (
              <>
                <UserPlus size={18} />
                创建并下一步
              </>
            ) : (
              <>
                <LogIn size={18} />
                登录
              </>
            )}
          </button>
        </form>

        {/* 切换 */}
        <p className="text-center text-sm mt-6" style={{ color: 'var(--muted-foreground)' }}>
          {isRegister ? '已有账号？' : '还没有账号？'}
          <button
            type="button"
            className="font-semibold ml-1"
            style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => switchMode(isRegister ? 'login' : 'register')}
          >
            {isRegister ? '直接登录' : '创建账号'}
          </button>
        </p>
      </div>
    </main>
  )
}
