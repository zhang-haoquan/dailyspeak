import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ArrowRight, ArrowLeft, Languages } from 'lucide-react'
import { DOMAINS, type Domain } from '../types'
import { useAuth } from '../hooks/useAuth'

const DOMAIN_DESC: Record<Domain, string> = {
  '计算机/IT': '技术面试、项目介绍、例会表达',
  '职场通用': '自我介绍、求职动机、邮件沟通',
  金融: '金融行业面试与客户沟通',
  汽车制造: '制造业英文汇报与会议',
}

export function OnboardingPage() {
  const { profile, saveProfile } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [domains, setDomains] = useState<Domain[]>(['计算机/IT', '职场通用'])
  const [dailyCount, setDailyCount] = useState(3)
  const [saving, setSaving] = useState(false)

  const toggleDomain = (d: Domain) => {
    setDomains((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
  }

  const clampCount = (n: number) => Math.min(10, Math.max(1, n))

  const handleStart = async () => {
    if (domains.length === 0 || saving) return
    setSaving(true)
    await new Promise((r) => setTimeout(r, 450))
    saveProfile(domains, clampCount(dailyCount))
    navigate('/', { replace: true })
  }

  const progress = step === 1 ? 50 : 100

  return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--gradient-soft)', padding: 24 }}>
      <section
        className="onboarding-card"
        role="dialog"
        aria-labelledby="onboarding-title"
        aria-label="学习方向设置"
        style={{
          width: '100%',
          maxWidth: 512,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-lg)',
          padding: 40,
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 14, color: 'var(--muted-foreground)', fontWeight: 500, letterSpacing: '0.02em' }}>
            第 {step} 步 / 共 2 步
          </span>
          <div className="ds-brand-badge" style={{ width: 40, height: 40, borderRadius: 12 }}>
            <Languages size={20} />
          </div>
        </div>

        <div className="text-block" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="onboarding-title" id="onboarding-title" style={{ fontSize: 24, fontWeight: 600, color: 'var(--foreground)', lineHeight: 1.2, margin: 0 }}>
            {step === 1 ? '选择你的学习方向' : '设定每日学习量'}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--muted-foreground)', lineHeight: 1.5, margin: 0 }}>
            {step === 1 ? '选择 1-3 个领域，我们将为你定制每日学习内容' : '建议 3 条/天，通勤几分钟即可完成'}
          </p>
        </div>

        {step === 1 ? (
          <div className="chips-grid" role="group" aria-label="学习领域" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {DOMAINS.map((d) => {
              const selected = domains.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleDomain(d)}
                  className={selected ? 'chip chip-selected' : 'chip chip-unselected'}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '10px 20px',
                    borderRadius: 999,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    lineHeight: 1,
                    transition: 'filter .18s ease, background-color .18s ease, border-color .18s ease',
                    ...(selected
                      ? { background: 'var(--gradient-primary)', color: 'var(--primary-foreground)', border: '1px solid transparent' }
                      : { background: 'var(--background-200)', color: 'var(--foreground)', border: '1px solid var(--border)' }),
                  }}
                  title={DOMAIN_DESC[d]}
                >
                  {selected && <Check size={14} />}
                  {d}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="daily-count-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <label className="daily-count-label" htmlFor="daily-count" style={{ fontSize: 15, fontWeight: 600, color: 'var(--foreground)' }}>
              每天学习几条
            </label>
            <div className="daily-count-control" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                id="daily-count"
                type="number"
                className="number-input"
                value={dailyCount}
                min={1}
                max={10}
                aria-label="每天学习条数"
                onChange={(e) => setDailyCount(clampCount(Number(e.target.value) || 1))}
                style={{
                  width: 80,
                  padding: '12px 16px',
                  border: '1px solid var(--input)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--background)',
                  color: 'var(--foreground)',
                  textAlign: 'center',
                  fontSize: 24,
                  fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                  outline: 'none',
                }}
              />
              <span style={{ fontSize: 14, color: 'var(--muted-foreground)', fontWeight: 500 }}>条/天</span>
            </div>
          </div>
        )}

        <div className="progress-block" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="progress-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 500 }}>
            <span>完成进度</span>
            <span>{progress}%</span>
          </div>
          <div className="progress-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="设置进度" style={{ height: 6, borderRadius: 999, background: 'var(--background-200)', overflow: 'hidden' }}>
            <div className="progress-fill" style={{ width: `${progress}%`, height: '100%', borderRadius: 999, background: 'var(--gradient-primary)', transition: 'width .3s ease' }} />
          </div>
        </div>

        <div className="flex" style={{ gap: 12 }}>
          {step === 2 && (
            <button type="button" className="ds-btn-ghost" onClick={() => setStep(1)} style={{ flex: 1 }}>
              <ArrowLeft size={16} />
              上一步
            </button>
          )}
          <button
            type="button"
            className="ds-btn-primary ds-btn-primary-lg"
            style={{ flex: 1 }}
            disabled={step === 1 ? domains.length === 0 : saving}
            onClick={() => (step === 1 ? setStep(2) : handleStart())}
          >
            {step === 1 ? (
              <>
                下一步
                <ArrowRight size={18} />
              </>
            ) : (
              <>
                开始今日学习
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>

        {step === 1 && domains.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--state-error)' }}>请至少选择一个学习领域</p>
        )}
        {profile && (
          <p className="text-sm text-center" style={{ color: 'var(--muted-foreground)' }}>
            当前已设置：{profile.domains.join('、')} · {profile.dailyCount} 条/天，可在此修改
          </p>
        )}
      </section>
    </main>
  )
}
