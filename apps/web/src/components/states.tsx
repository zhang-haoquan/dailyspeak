import { Loader2, CircleAlert, RefreshCw, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ApiError } from '../services/http'

/**
 * 加载态 / 错误态 / 空态的统一样式（PRD 5.x 各页面通用）
 *
 * 之前每个页面各写各的，且大多**根本没有**这些状态——请求慢或失败时页面一片空白，
 * 用户不知道是在加载还是坏了。统一在这里出，保证三态样式与文案一致。
 */

/** 把任何抛出来的东西翻成一句人话 */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isUnauthorized) return '登录状态已失效，请重新登录'
    return error.message
  }
  if (error instanceof Error && error.message) return '网络异常，请检查网络后重试'
  return '加载失败，请稍后重试'
}

/** 居中加载态 */
export function LoadingPanel({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="ds-state-panel" role="status" aria-live="polite">
      <Loader2 size={22} className="animate-spin" style={{ color: 'var(--brand-500)' }} />
      <p className="ds-state-title">{label}</p>
    </div>
  )
}

/** 卡片骨架屏：比转圈更少"页面跳一下"的感觉 */
export function SkeletonCards({ count = 2 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="ds-card" key={i}>
          <div className="ds-skeleton ds-skeleton-chip" />
          <div className="ds-skeleton ds-skeleton-line" style={{ width: '88%' }} />
          <div className="ds-skeleton ds-skeleton-line" style={{ width: '62%' }} />
          <div className="ds-skeleton ds-skeleton-btn" />
        </div>
      ))}
    </div>
  )
}

/** 错误态：给出原因 + 重试 */
export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="ds-card ds-state-panel" role="alert">
      <CircleAlert size={24} style={{ color: 'var(--state-error)' }} />
      <p className="ds-state-title" style={{ color: 'var(--state-error)' }}>
        {describeError(error)}
      </p>
      {onRetry && (
        <button className="ds-btn-ghost" type="button" onClick={onRetry}>
          <RefreshCw size={14} />
          重试
        </button>
      )}
    </div>
  )
}

/**
 * 空态：说明"这里本来该有什么"。
 * 不带 `ds-card`——空态总是嵌在某个卡片区块内部，再套一层会变成「盒子里套盒子」。
 */
export function EmptyPanel({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="ds-state-panel">
      <Icon size={26} style={{ opacity: 0.45, color: 'var(--muted-foreground)' }} />
      <p className="ds-state-title">{title}</p>
      {hint && <p className="ds-state-hint">{hint}</p>}
      {action}
    </div>
  )
}
