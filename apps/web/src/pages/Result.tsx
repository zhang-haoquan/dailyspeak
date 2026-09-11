import { useMemo } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { Languages, CircleCheck, CircleAlert, ArrowRight, Mic } from 'lucide-react'
import { ScoreRing } from '../components/ScoreRing'
import { PlaybackButton } from '../components/PlaybackButton'
import { TranscriptCard } from '../components/TranscriptCard'
import * as api from '../services/api'
import type { RepeatScore } from '../types'

export function ResultPage() {
  const { cardId } = useParams()
  const [searchParams] = useSearchParams()
  const mode = (searchParams.get('mode') as 'new' | 'review') || 'new'
  const navigate = useNavigate()
  const location = useLocation()

  const stateScore = (location.state as { repeatScore?: RepeatScore; audioUrl?: string | null } | null)
    ?.repeatScore
  // 本次录音的回听地址（由学习页交接过来；刷新后失效）
  const audioUrl =
    (location.state as { audioUrl?: string | null } | null)?.audioUrl ?? null

  // 刷新兜底：从已保存进度恢复
  const savedScore = useMemo(() => {
    if (stateScore) return stateScore
    const user = api.getSessionUser()
    if (!user || !cardId) return null
    const p = api.getCardProgress(user.id, cardId)
    if (!p?.repeatScore) return null
    return {
      score: p.repeatScore,
      feedback: [{ ok: true, text: '已记录上次跟读得分' }],
    } as RepeatScore
  }, [stateScore, cardId])

  const card = api.getCardById(cardId ?? '')

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
            onClick={() => navigate(`/learn/${card.id}/answer?mode=${mode}`)}
          >
            <span>进入情境应答</span>
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </main>
  )
}
