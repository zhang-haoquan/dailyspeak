import { useState, type FormEvent } from 'react'
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
  MailCheck,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { isEmail, isStrongPassword } from '../services/validation'
import { ApiError } from '../services/http'

type Mode = 'login' | 'register'
type Field = 'account' | 'password' | 'confirm'
type FieldErrors = Partial<Record<Field, string>>

/** 本地开发时验证邮件落在 Mailpit，给个可点击的提示 */
const MAILPIT_URL = 'http://127.0.0.1:54324'

export function LoginPage() {
  const { login, register } = useAuth()

  const [mode, setMode] = useState<Mode>('login')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  /** 注册成功后等待用户点击验证邮件 */
  const [sentTo, setSentTo] = useState<string | null>(null)

  const isRegister = mode === 'register'

  const switchMode = (m: Mode) => {
    setMode(m)
    setFieldErrors({})
    setError(null)
    setPassword('')
    setConfirm('')
    setShowPassword(false)
    setSentTo(null)
  }

  /** PRD 5.1 字段规则：邮箱、密码强度、确认密码一致 —— 全部内联报错 */
  const validate = (): FieldErrors => {
    const next: FieldErrors = {}
    if (!account.trim()) next.account = '请输入邮箱'
    else if (!isEmail(account)) next.account = '请输入合法的邮箱地址'

    if (!password) next.password = isRegister ? '请设置密码' : '请输入密码'
    else if (isRegister && !isStrongPassword(password))
      next.password = '密码至少 8 位，需包含大小写字母和数字'

    if (isRegister) {
      if (!confirm) next.confirm = '请再次输入密码'
      else if (confirm !== password) next.confirm = '两次输入的密码不一致'
    }
    return next
  }

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
    try {
      const result = isRegister ? await register(account, password) : await login(account, password)

      if (!result.ok) {
        setError(result.error)
        return
      }
      if (result.needsEmailConfirmation) {
        setSentTo(account.trim())
        return
      }
      // 登录成功：路由守卫会按 profile.onboarded 决定去引导页还是学习台
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录服务暂时不可用，请稍后重试')
    } finally {
      setSubmitting(false)
    }
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

        {sentTo ? (
          /* ---------- 注册成功：等待邮箱验证 ---------- */
          <div className="flex flex-col items-center text-center gap-4">
            <div
              className="flex items-center justify-center"
              style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                background: 'var(--teal-50)',
                color: 'var(--teal-600)',
              }}
            >
              <MailCheck size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>
                验证邮件已发送
              </h1>
              <p className="text-sm mt-2" style={{ color: 'var(--muted-foreground)' }}>
                我们已向 <strong style={{ color: 'var(--foreground)' }}>{sentTo}</strong>{' '}
                发送了一封验证邮件，请点击邮件里的链接完成注册。
              </p>
            </div>
            <p
              className="text-xs text-center"
              style={{
                color: 'var(--state-warning)',
                background: 'var(--state-warning-surface)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                lineHeight: 1.6,
              }}
            >
              本地开发不会真的发信，验证邮件在{' '}
              <a
                href={MAILPIT_URL}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--brand-600)' }}
              >
                Mailpit（127.0.0.1:54324）
              </a>{' '}
              里查看。
            </p>
            <button type="button" className="ds-btn-ghost mt-2" onClick={() => switchMode('login')}>
              <LogIn size={16} />
              返回登录
            </button>
          </div>
        ) : (
          <>
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
                <label
                  htmlFor="account"
                  className="text-sm font-medium"
                  style={{ color: 'var(--foreground)' }}
                >
                  邮箱
                </label>
                <div className="ds-input-wrap">
                  <Mail className="ds-input-icon" />
                  <input
                    id="account"
                    name="email"
                    type="email"
                    inputMode="email"
                    className={inputClass('account')}
                    placeholder="请输入邮箱"
                    autoComplete="email"
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
                <label
                  htmlFor="password"
                  className="text-sm font-medium"
                  style={{ color: 'var(--foreground)' }}
                >
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
                  <label
                    htmlFor="confirm"
                    className="text-sm font-medium"
                    style={{ color: 'var(--foreground)' }}
                  >
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
          </>
        )}
      </div>
    </main>
  )
}
