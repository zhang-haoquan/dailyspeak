import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Mic, ArrowRight, CircleCheck, Languages, Sparkles, CalendarClock } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import * as api from '../services/api'
import { stageInfo } from '../services/review'
import type { TodayCard } from '../types'

function formatDateZh(d: Date): string {
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 周${week}`
}

function CardItem({ item }: { item: TodayCard }) {
  const { card, type } = item
  const stage = type === 'review' ? stageInfo(item.stage ?? 1) : null
  const url = `/learn/${card.id}?mode=${type}`

  return (
    <article className="ds-card ds-card-hover flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="ds-chip-domain">{card.domain}</span>
        <span className="ds-meta">
          {type === 'review' ? (
            <>
              {stage?.label} · 第 {item.stage} 次
              {item.lastScore ? ` · ${item.lastScore}分` : ''}
            </>
          ) : (
            '新句'
          )}
        </span>
      </div>
      <h3 className="text-lg font-semibold leading-snug">{card.sentence}</h3>
      <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
        {card.sceneZh} · {card.tag}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        {item.repeatDone ? (
          <span className="ds-step-pill ds-step-done">
            <CircleCheck size={12} /> 跟读
          </span>
        ) : (
          <span className="ds-step-pill ds-step-current">
            <Mic size={12} /> 跟读
          </span>
        )}
        <ChevronRight size={16} style={{ color: 'var(--muted-foreground)', flex: '0 0 auto' }} />
        {item.answerDone ? (
          <span className="ds-step-pill ds-step-done">
            <CircleCheck size={12} /> 应答
          </span>
        ) : (
          <span className="ds-step-pill ds-step-pending">应答</span>
        )}
      </div>
      <Link
        to={url}
        className="ds-btn-primary self-start mt-1"
        style={{ fontSize: 13, padding: '9px 20px' }}
      >
        {item.repeatDone && item.answerDone ? '再次练习' : '开始练习'}
        <ArrowRight size={14} />
      </Link>
    </article>
  )
}

export function DashboardPage() {
  const { user, profile } = useAuth()

  const todayCards = useMemo(() => {
    if (!user || !profile) return [] as TodayCard[]
    return api.getTodayCards(user.id, profile)
  }, [user, profile])

  // 只有「跟读 + 应答」都完成才算一条（PRD 5.4 已掌握）
  const doneCount = todayCards.filter((t) => t.repeatDone && t.answerDone).length
  const total = todayCards.length
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100)

  const newCards = todayCards.filter((t) => t.type === 'new')
  const reviewCards = todayCards.filter((t) => t.type === 'review')

  return (
    <main>
      <nav className="ds-nav" aria-label="Primary">
        <div className="ds-nav-inner">
          <Link to="/" className="ds-logo">
            <Languages size={20} style={{ color: 'var(--brand-500)' }} />
            DailySpeak
          </Link>
          <Link to="/history" className="ds-link-muted">
            <span>学习记录</span>
            <ChevronRight size={16} />
          </Link>
        </div>
      </nav>

      <div className="ds-container">
        <section className="flex items-end justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{formatDateZh(new Date())}</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
              今日学习进度{total === 0 ? ' · 今天没有待办卡片' : ''}
            </p>
          </div>
          {total > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold">
                {doneCount}/{total} 完成
              </span>
              <div className="ds-progress-track">
                <div className="ds-progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </section>

        {/* 新句 */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Sparkles size={18} style={{ color: 'var(--brand-500)' }} />
            新句
          </h2>
          {newCards.length === 0 ? (
            <div className="ds-card text-center py-10" style={{ color: 'var(--muted-foreground)' }}>
              <Sparkles size={28} className="mx-auto mb-3" style={{ opacity: 0.5 }} />
              <p className="font-medium" style={{ color: 'var(--foreground)' }}>今日新句已学完</p>
              <p className="text-sm mt-1">明天再来学新句子，或复习下面到期的卡片</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {newCards.map((item) => (
                <CardItem key={item.card.id} item={item} />
              ))}
            </div>
          )}
        </section>

        {/* 复习 */}
        <section>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <CalendarClock size={18} style={{ color: 'var(--teal-500)' }} />
            复习
          </h2>
          {reviewCards.length === 0 ? (
            <div className="ds-card text-center py-10" style={{ color: 'var(--muted-foreground)' }}>
              <CalendarClock size={28} className="mx-auto mb-3" style={{ opacity: 0.5 }} />
              <p className="font-medium" style={{ color: 'var(--foreground)' }}>今天没有到期的复习卡</p>
              <p className="text-sm mt-1">学完的新句会按遗忘曲线自动安排复习</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reviewCards.map((item) => (
                <CardItem key={item.card.id} item={item} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
