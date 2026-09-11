import { useMemo } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { Languages, CircleCheck, CircleAlert, ArrowRight, Mic } from 'lucide-react'
import { ScoreRing } from '../components/ScoreRing'
import { PlaybackButton } from '../components/PlaybackButton'
import { ErrorPanel, LoadingPanel } from '../components/states'
import { TranscriptCard } from '../components/TranscriptCard'
import { useCardDetail } from '../hooks/queries'
import type { LearningMode } from '@dailyspeak/shared'
import type { RepeatScore } from '../services/scoring'

export function ResultPage() {
  const { cardId } = useParams()
  const [searchParams] = useSearchParams()
  const mode: LearningMode = searchParams.get('mode') === 'review' ? 'review' : 'new'
  const navigate = useNavigate()
  const location = useLocation()

  const detail = useCardDetail(cardId)
  const card = detail.data?.card

  const stateScore = (location.state as { repeatScore?: RepeatScore; audioUrl?: string | null } | null)
    ?.repeatScore
  // 本次录音的回听地址（由学习页交接过来；刷新后失效）
  const audioUrl =
    (location.state as { audioUrl?: string | null } | null)?.audioUrl ?? null

  // 刷新兜底：从服务端已保存的进度恢复（只有分数，没有当时的逐词反馈）
  const savedScore = useMemo(() => {
    if (stateScore) return stateScore
    const stored = detail.data?.progress?.repeatScore
    if (stored == null) return null
    return {
      score: stored,
      feedback: [{ ok: true, text: '已记录上次跟读得分' }],
    } as RepeatScore
  }, [stateScore, detail.data])

  if (detail.isPending) {
    return (
      <div className="ds-center-page">
        <div className="ds-card" style={{ maxWidth: 360, width: '100%' }}>
          <LoadingPanel label="正在加载结果…" />
        </div>
      </div>
    )
  }

  if (detail.isError) {
    return (
      <div className="ds-center-page">
        <div style={{ maxWidth: 360, width: '100%' }}>
          <ErrorPanel error={detail.error} onRetry={() => void detail.refetch()} />
          <div className="text-center mt-4">
            <Link to="/" className="ds-link-primary">
              返回学习台
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!savedScore || !card) {
    return (
      <div className="ds-center-page">
        <div className="ds-card text-center" style={{ maxWidth: 360 }}>
          <p className="font-semibold mb-2">暂无评测结果</p>
          <p className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>
            请先完成跟读录音后再查看打分
          </p>
          <Link to="/" className="ds-link-primary mx-auto">
            返回学习台 <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    )
  }

  const score = savedScore.score
  const lowScore = score < 78

  return (
    <main>
      <nav className="ds-nav" aria-label="Primary">
        <div className="ds-nav-inner" style={{ maxWidth: '48rem' }}>
          <Link to="/" className="ds-logo">
            <Languages size={20} style={{ color: 'var(--brand-500)' }} />
            DailySpeak
          </Link>
        </div>
      </nav>

      <div className="ds-container" style={{ maxWidth: '48rem' }}>
        <header className="text-center mb-8">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>
            练习结果
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
            跟读完成{lowScore ? ' · 建议再录一次，追求 85+ 分' : ''}
          </p>
        </header>

        <div className="flex justify-center items-start gap-8 mb-10" style={{ gap: '1.5rem' }}>
          <ScoreRing score={score} label="发音得分" />
          <ScoreRing score={null} label="情境应答" />
        </div>

        <div className="feedback-card mb-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--foreground)' }}>
            发音反馈
          </h2>
          <ul className="space-y-3">
            {savedScore.feedback.map((f, i) => (
              <li key={i} className="flex items-center gap-3">
                {f.ok ? (
                  <CircleCheck size={20} style={{ color: 'var(--state-success)', flexShrink: 0 }} />
                ) : (
                  <CircleAlert size={20} style={{ color: 'var(--state-error)', flexShrink: 0 }} />
                )}
                <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                  {f.text}
                </span>
              </li>
            ))}
          </ul>
          {(lowScore || audioUrl) && (
            <div className="flex justify-center items-center gap-3 mt-6 flex-wrap">
              <PlaybackButton src={audioUrl} style={{ marginTop: 0 }} />
              {lowScore && (
                <button
                  className="ds-btn-ghost"
                  onClick={() => navigate(`/learn/${card.id}?mode=${mode}`, { replace: true })}
                >
                  <Mic size={16} />
                  再来一次（重录跟读）
                </button>
              )}
            </div>
          )}
        </div>

        {/* 我听到的：ASR 转写结果，反馈里的问题词都能在这里对上 */}
        {savedScore.transcript && (
          <TranscriptCard
            heard={{
              text: savedScore.transcript,
              source: savedScore.transcriptSource ?? 'mock',
              alignment: savedScore.alignment,
              similarity: savedScore.similarity,
            }}
            compareLabel="对比原句"
            className="ds-heard-card"
          />
        )}

        <div className="flex justify-center">
          <button
            className="ds-btn-primary"
            style={{ padding: '14px 32px', fontSize: 16 }}
            onClick={() =>
              navigate(`/learn/${card.id}/answer?mode=${mode}`, {
                replace: true,
                // 把跟读分交接给应答页，用于展示整卡综合分（同一次练习）。
                // 注意键名与学习页交接给本页的 `repeatScore` 不同：那个是完整结果对象，
                // 这里只要一个数字，用不同名字避免看错类型。
                state: { repeatScoreValue: score },
              })
            }
          >
            <span>进入情境应答</span>
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </main>
  )
}
