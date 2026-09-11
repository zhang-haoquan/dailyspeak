import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CircleCheck, FileText, Star, Languages } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import * as api from '../services/api'

function StatCard({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) {
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

export function HistoryPage() {
  const { user } = useAuth()
  const stats = useMemo(() => (user ? api.getHistoryStats(user.id) : null), [user])

  if (!stats) {
    return (
      <div className="ds-center-page">
        <div className="ds-card text-center" style={{ maxWidth: 360 }}>
          <p className="font-semibold mb-2">暂无学习记录</p>
          <Link to="/" className="ds-link-primary mx-auto">
            返回学习台
          </Link>
        </div>
      </div>
    )
  }

  const monthLabel = `${new Date().getFullYear()}年${new Date().getMonth() + 1}月`
  const maxActivity = Math.max(1, ...stats.weekActivity)
  const weekLabels = ['一', '二', '三', '四', '五', '六', '日']

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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon={<CircleCheck size={20} />} value={stats.streak} label="连续学习天数" color="var(--state-success)" />
          <StatCard icon={<FileText size={20} />} value={stats.monthCards} label="本月学习卡片" color="var(--brand-400)" />
          <StatCard icon={<Star size={20} />} value={stats.totalCards} label="累计学习卡片" color="var(--teal-400)" />
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
                    title={`${weekLabels[i]}：${v} 张卡`}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="ds-days">
            {weekLabels.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
        </div>

        <div className="ds-card mt-6">
          <h2 className="text-lg font-semibold mb-2">最近练习</h2>
          {stats.recent.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--muted-foreground)' }}>
              还没有练习记录，去学习台开始第一张卡吧
            </p>
          ) : (
            <div>
              {stats.recent.map((r, i) => (
                <div className="ds-activity flex items-center justify-between py-3" key={i}>
                  <div>
                    <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                      {r.date}
                    </div>
                    <div className="text-sm font-medium mt-1">{r.title}</div>
                  </div>
                  <span className="ds-score">{r.score}分</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
