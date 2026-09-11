import { useState } from 'react'
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom'
import {
  Languages,
  ArrowLeft,
  Laptop,
  MessagesSquare,
  Mic,
  CirclePlay,
  Check,
  CircleCheck,
  CircleAlert,
  Home,
  TriangleAlert,
} from 'lucide-react'
import { AUDIO_LIMITS, compositeScore, type AnswerScore } from '@dailyspeak/shared'
import { useCardDetail } from '../hooks/queries'
import { useRecorder, formatTime } from '../hooks/useRecorder'
import { useSpeech } from '../hooks/useSpeech'
import { ScoreRing } from '../components/ScoreRing'
import { PlaybackButton } from '../components/PlaybackButton'
import { ErrorPanel, LoadingPanel } from '../components/states'
import { TranscriptCard } from '../components/TranscriptCard'
import { api } from '../services/endpoints'
import { ApiError } from '../services/http'
import { encodeToWav16kMono } from '../utils/wav'

const DIMENSION_LABELS: Record<keyof NonNullable<AnswerScore['dimensions']>, string> = {
  content: '内容正确性',
  grammar: '语法准确性',
  fluency: '表达流利度',
  vocabulary: '措辞丰富度',
}

/** 自动停止点比服务端上限略早 */
const AUTO_STOP_MS = AUDIO_LIMITS.answer.maxSeconds * 1000 - 1000

export function AnswerPage() {
  const { cardId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const detail = useCardDetail(cardId)
  const card = detail.data?.card
  const recorder = useRecorder({ maxMs: AUTO_STOP_MS })
  const { speak } = useSpeech()

  const [result, setResult] = useState<AnswerScore | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 跟读分：优先取结果页交接过来的（同一次练习），刷新兜底才回服务端进度
  const handedRepeatScore = (location.state as { repeatScoreValue?: number } | null)?.repeatScoreValue
  const repeatScore = handedRepeatScore ?? detail.data?.progress?.repeatScore ?? null

  if (detail.isPending) {
    return (
      <div className="ds-center-page">
        <div className="ds-card" style={{ maxWidth: 360, width: '100%' }}>
          <LoadingPanel label="正在加载卡片…" />
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

  if (!card) {
    return (
      <div className="ds-center-page">
        <div className="ds-card text-center" style={{ maxWidth: 360 }}>
          <p className="font-semibold mb-2">未找到该卡片</p>
          <Link to="/" className="ds-link-primary mx-auto">
            返回学习台
          </Link>
        </div>
      </div>
    )
  }

  const submitRecording = async (blob: Blob) => {
    setSubmitting(true)
    setError(null)
    try {
      const clip = await encodeToWav16kMono(blob)
      const scored = await api.scoreAnswer(card.id, clip.blob)
      setResult(scored)
    } catch (err) {
      setResult(null)
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : '评测失败，请重试',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleMicClick = async () => {
    setError(null)
    if (recorder.recording) {
      const clip = await recorder.stop()
      if (clip) await submitRecording(clip.blob)
    } else {
      setResult(null)
      await recorder.start()
    }
  }

  const handleFinish = () => {
    // 分数与排期都由服务端在评测时写入，这里只需要回到学习台
    navigate('/', { replace: true })
  }

  // ---------- 完成态：展示应答得分与反馈 ----------
  if (result) {
    return (
      <main>
        <nav className="ds-nav" aria-label="Primary">
          <div className="ds-nav-inner" style={{ maxWidth: '48rem' }}>
            <span className="ds-logo">
              <Languages size={20} style={{ color: 'var(--brand-500)' }} />
              DailySpeak
            </span>
          </div>
        </nav>

        <div className="ds-container" style={{ maxWidth: '48rem' }}>
          <header className="text-center mb-8">
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>
              情境应答 · 结果
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
              {result.degraded
                ? '本次未能完成评测'
                : 'AI 已根据内容、语法、流利度与措辞完成评测'}
            </p>
          </header>

          {result.degraded ? (
            <div className="ds-alert mb-8">
              <TriangleAlert size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{result.degradedReason ?? '本次未产生打分，稍后可重测'}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-center mb-6">
                <ScoreRing score={result.score} label="应答综合分" />
              </div>

              {/* 整卡的两步分与综合分：跟读分由结果页交接过来（同一次练习） */}
              {repeatScore !== null && result.score !== null && (
                <p className="text-sm text-center mb-10" style={{ color: 'var(--muted-foreground)' }}>
                  跟读 {repeatScore} 分 · 应答 {result.score} 分 ·{' '}
                  <strong style={{ color: 'var(--foreground)' }}>
                    综合 {compositeScore(repeatScore, result.score)} 分
                  </strong>
                </p>
              )}

              {result.dimensions && (
                <div className="feedback-card mb-6">
                  <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--foreground)' }}>
                    维度评分
                  </h2>
                  <div className="space-y-4">
                    {(Object.keys(result.dimensions) as (keyof NonNullable<AnswerScore['dimensions']>)[]).map((k) => (
                      <div key={k}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{DIMENSION_LABELS[k]}</span>
                          <span className="text-sm font-semibold" style={{ color: 'var(--brand-600)' }}>
                            {result.dimensions![k]}
                          </span>
                        </div>
                        <div className="ds-progress-track" style={{ minWidth: 0 }}>
                          <div className="ds-progress-fill" style={{ width: `${result.dimensions![k]}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="feedback-card mb-6">
                <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--foreground)' }}>
                  反馈
                </h2>
                <ul className="space-y-3">
                  {result.feedback.map((f, i) => (
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
              </div>

              {result.suggestion && (
                <div
                  className="feedback-card mb-8"
                  style={{ background: 'var(--teal-50)', borderColor: 'var(--teal-200)' }}
                >
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--teal-700)' }}>
                    一句话改进建议
                  </p>
                  <p className="text-sm" style={{ color: 'var(--foreground)' }}>
                    {result.suggestion}
                  </p>
                </div>
              )}
            </>
          )}

          {card.referenceAnswer && (
            <div className="feedback-card mb-8">
              <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--muted-foreground)' }}>
                参考答案（供对比）
              </h2>
              <p className="text-sm" style={{ color: 'var(--foreground)' }}>
                {card.referenceAnswer}
              </p>
            </div>
          )}

          {/* 我听到的：ASR 转写，确认「是不是我说错了」还是「系统听错了」 */}
          {result.transcript && result.transcriptSource && (
            <TranscriptCard heard={{ text: result.transcript, source: result.transcriptSource }} />
          )}

          <div className="flex justify-center items-center gap-3 flex-wrap mt-8">
            <PlaybackButton src={recorder.audioUrl} label="听我的回答" style={{ marginTop: 0 }} />
            <button className="ds-btn-primary" style={{ padding: '14px 32px', fontSize: 16 }} onClick={handleFinish}>
              <Home size={18} />
              完成 · 返回学习台
            </button>
          </div>
        </div>
      </main>
    )
  }

  // ---------- 录音态 ----------
  return (
    <main>
      <header className="ds-nav" aria-label="Primary">
        <div className="ds-nav-inner" style={{ maxWidth: '48rem' }}>
          <span className="ds-logo">
            <Languages size={20} style={{ color: 'var(--brand-500)' }} />
            DailySpeak
          </span>
          <button
            className="ds-link-muted"
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none' }}
          >
            <ArrowLeft size={16} />
            返回
          </button>
        </div>
      </header>

      <div className="ds-container" style={{ maxWidth: '48rem' }}>
        <div className="ds-tag-row" style={{ justifyContent: 'center' }}>
          <span className="ds-domain-tag">
            <Laptop size={12} style={{ marginRight: 6 }} />
            {card.domain}
          </span>
          <span className="ds-step-tag">
            <MessagesSquare size={12} style={{ marginRight: 6 }} />
            情境应答
          </span>
        </div>

        <article
          className="q-card"
          style={{
            maxWidth: '42rem',
            margin: '1.5rem auto 0',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-md)',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 600,
              color: 'var(--muted-foreground)',
              margin: 0,
            }}
          >
            面试官提问
          </p>
          <h2
            style={{
              marginTop: '0.75rem',
              fontSize: '1.5rem',
              fontWeight: 600,
              lineHeight: 1.3,
              color: 'var(--foreground)',
            }}
          >
            {card.prompt}
          </h2>
          <p style={{ marginTop: '0.5rem', fontSize: '1rem', color: 'var(--muted-foreground)' }}>
            {card.promptZh}
          </p>
        </article>

        <section
          style={{
            marginTop: '2.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <p className="ds-instruction">
            用自己的话回答，时长 {AUDIO_LIMITS.answer.minSeconds}–{AUDIO_LIMITS.answer.maxSeconds} 秒
          </p>
          <button
            className={`ds-mic-btn${recorder.recording ? ' is-recording' : ''}`}
            type="button"
            aria-label={recorder.recording ? '停止录音' : '点击开始录音'}
            onClick={handleMicClick}
            disabled={submitting}
          >
            <span className="ds-mic-ring" aria-hidden="true" />
            {recorder.recording ? <Check size={36} /> : <Mic size={36} />}
          </button>
          <p className="ds-instruction" style={{ marginTop: '1rem' }}>
            {recorder.recording
              ? '正在录音…再次点击停止'
              : submitting
                ? '正在评测…'
                : '点击开始录音'}
          </p>
          <div className="ds-timer">{formatTime(recorder.elapsedMs)}</div>

          {/* 回听自己的回答 */}
          {!recorder.recording && <PlaybackButton src={recorder.audioUrl} label="听我的回答" />}

          {recorder.autoStopped && (
            <p className="ds-heard-notice">
              已到 {AUDIO_LIMITS.answer.maxSeconds} 秒上限，自动停止录音
            </p>
          )}

          {recorder.error && (
            <p
              className="text-sm mt-3 px-4 py-3 rounded-lg"
              style={{ background: 'var(--state-error-surface)', color: 'var(--state-error)' }}
            >
              {recorder.error}
            </p>
          )}
          {error && (
            <p
              className="text-sm mt-3 px-4 py-3 rounded-lg"
              style={{ background: 'var(--state-error-surface)', color: 'var(--state-error)' }}
            >
              {error}
            </p>
          )}
        </section>

        <div
          style={{
            marginTop: '2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <button className="ds-btn-ghost" type="button" onClick={() => speak(card.prompt)}>
            <CirclePlay size={16} />
            重听题目
          </button>
          <button
            className="ds-btn-ghost"
            type="button"
            disabled={!recorder.recording && recorder.audioUrl === null}
            onClick={() => {
              recorder.cancel()
              setResult(null)
              setError(null)
            }}
          >
            重录
          </button>
        </div>

        {/* PRD 09：没有麦克风时看参考答案，不伪造分数 */}
        {card.referenceAnswer && !recorder.recording && (
          <div className="feedback-card" style={{ marginTop: '2rem' }}>
            <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--muted-foreground)' }}>
              没有麦克风？先看参考答案（本次不计分）
            </h2>
            <p className="text-sm" style={{ color: 'var(--foreground)' }}>
              {card.referenceAnswer}
            </p>
            <div className="text-center mt-4">
              <Link to="/" className="ds-link-muted" style={{ fontSize: '0.8rem' }}>
                返回学习台
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
