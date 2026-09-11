import { Link } from 'react-router-dom'
import { ArrowLeft, CircleCheck, FileText, Languages, Star, CalendarRange } from 'lucide-react'
import type { HistoryEntry } from '@dailyspeak/shared'
import { useHistory } from '../hooks/queries'
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../components/states'

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function StatCard({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ReactNode
  value: number
  label: string
  color: string
}) {
  return (
    <div className="ds-card ds-stat">
      <span className="ds-stat-icon" style={{ color }}>
        {icon}
      </span>
      <div className="text-4xl font-bold ds-gradient-text">{value}</div>
      <div className="text-sm mt-2" style={{ color: 'var(--muted-foreground)' }}>
        {label}
      </div>
    </div>
  )
}

/** 最近练习的一行。score 为 null 表示「未打分」（PRD 09 降级），如实展示，不伪造分数 */
function PracticeRow({ entry }: { entry: HistoryEntry }) {
  return (
    <div className="ds-activity flex items-center justify-between py-3">
      <div>
        <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          {entry.date}
        </div>
        <div className="text-sm font-medium mt-1">{entry.title}</div>
      </div>
      {entry.score === null ? (
        <span className="ds-score-empty" title="本次未产生打分（只完成跟读，或评测服务不可用）">
          未打分
        </span>
      ) : (
        <span className="ds-score">{entry.score}分</span>
      )}
    </div>
  )
}

export function HistoryPage() {
  const { data: stats, isPending, isError, error, refetch } = useHistory()

  const monthLabel = `${new Date().getFullYear()}年${new Date().getMonth() + 1}月`
  const maxActivity = Math.max(1, ...(stats?.weekActivity ?? [0]))

  return (
    <main>
      <header
        className="sticky top-0 z-50 h-14 flex items-center px-6"
        style={{ background: 'var(--background)', borderBottom: '1px solid var(--border)' }}
      >
        <Link to="/" className="ds-logo" style={{ fontSize: '1.125rem' }}>
          <Languages size={18} style={{ color: 'var(--brand-500)' }} />
          DailySpeak
        </Link>
        <Link to="/" className="ds-link-muted ml-auto">
          <ArrowLeft size={16} />
          <span>返回首页</span>
        </Link>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">学习记录</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
            {monthLabel}
          </p>
        </div>

        {isPending && <LoadingPanel label="正在加载学习记录…" />}

        {isError && <ErrorPanel error={error} onRetry={() => void refetch()} />}

        {stats && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                icon={<CircleCheck size={20} />}
                value={stats.streak}
                label="连续学习天数"
                color="var(--state-success)"
              />
              <StatCard
                icon={<FileText size={20} />}
                value={stats.monthCards}
                label="本月学习卡片"
                color="var(--brand-400)"
              />
              <StatCard
                icon={<Star size={20} />}
                value={stats.totalCards}
                label="累计学习卡片"
                color="var(--teal-400)"
              />
            </div>

            <div className="ds-card mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">本周学习进度</h2>
                <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                  共 {stats.weekActivity.reduce((a, b) => a + b, 0)} 张卡
                </span>
              </div>
              <div className="ds-chart-area">
                <div className="ds-chart-label">周学习趋势图</div>
                <div className="ds-bars">
                  {stats.weekActivity.map((v, i) => (
                    <div className="ds-bar-col" key={i}>
                      <div
                        className="ds-bar"
                        style={{ height: v === 0 ? 0 : `${Math.max(6, (v / maxActivity) * 100)}%` }}
                        title={`${WEEK_LABELS[i]}：${v} 张卡`}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="ds-days">
                {WEEK_LABELS.map((d, i) => (
                  <span key={i}>{d}</span>
                ))}
              </div>
            </div>

            <div className="ds-card mt-6">
              <h2 className="text-lg font-semibold mb-2">最近练习</h2>
              {stats.recent.length === 0 ? (
                <EmptyPanel
                  icon={CalendarRange}
                  title="还没有练习记录"
                  hint="去学习台开始第一张卡吧"
                  action={
                    <Link to="/" className="ds-link-primary">
                      去学习
                    </Link>
                  }
                />
              ) : (
                <div>
                  {stats.recent.map((r) => (
                    <PracticeRow key={`${r.cardId}-${r.date}`} entry={r} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
