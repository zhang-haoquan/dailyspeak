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
  Loader2,
  CircleCheck,
  CircleAlert,
  Home,
} from 'lucide-react'
import { useCardDetail } from '../hooks/queries'
import { compositeScore } from '@dailyspeak/shared'
import { useRecorder, formatTime } from '../hooks/useRecorder'
import { useTranscriber } from '../hooks/useTranscriber'
import { useSpeech } from '../hooks/useSpeech'
import { scoreAnswer, type AnswerScore } from '../services/scoring'
import { ScoreRing } from '../components/ScoreRing'
import { PlaybackButton } from '../components/PlaybackButton'
import { ErrorPanel, LoadingPanel } from '../components/states'
import { TranscriptCard, type HeardResult } from '../components/TranscriptCard'
import { mockTranscript } from '../services/asr'

const DIMENSION_LABELS: Record<keyof AnswerScore['dimensions'], string> = {
  content: '内容正确性',
  grammar: '语法准确性',
  fluency: '表达流利度',
  vocabulary: '措辞丰富度',
}

export function AnswerPage() {
  const { cardId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const detail = useCardDetail(cardId)
  const card = detail.data?.card
  const recorder = useRecorder()
  const transcriber = useTranscriber()
  const { speak } = useSpeech()

  const [hasRecording, setHasRecording] = useState(false)
  const [heard, setHeard] = useState<HeardResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<AnswerScore | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 跟读分：优先取结果页交接过来的（同一次练习），刷新兜底才回服务端进度
  const handedRepeatScore = (location.state as { repeatScoreValue?: number } | null)
    ?.repeatScoreValue
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

  /**
   * 情境应答没有唯一原文，「我听到的」只回显转写文本，不做逐词比对。
   * 优先用浏览器真实转写，不可用时用本地模拟转写兜底并标注来源。
   */
  const buildHeard = (transcript: string, durationMs: number, notice?: string): HeardResult => {
    const real = transcript.trim()
    return {
      text: real || mockTranscript(card.prompt, durationMs, 0.12),
      source: real ? 'browser' : 'mock',
      notice,
    }
  }

  const handleMicClick = async () => {
    setError(null)
    if (recorder.recording) {
      // recorder.elapsedMs 是上一次渲染的快照，这里用 stop() 的返回值
      const clip = await recorder.stop()
      const transcript = await transcriber.stop()
      setHasRecording(true)
      setHeard(buildHeard(transcript, clip?.durationMs ?? 0, transcriber.error ?? undefined))
    } else {
      setHasRecording(false)
      setHeard(null)
      transcriber.start()
      await recorder.start()
    }
  }

  const handleSubmit = async () => {
    if (!hasRecording || submitting) return
    setSubmitting(true)
    try {
      const answerResult = await scoreAnswer(card, recorder.elapsedMs || 4000)
      setResult(answerResult)
    } catch {
      setError('评测服务暂时不可用，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  /** PRD 09：无麦克风/权限被拒时的兜底——不录音直接模拟评测 */
  const handleSkipSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const answerResult = await scoreAnswer(card, 35000)
      setResult(answerResult)
    } catch {
      setError('评测服务暂时不可用，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  /** 完成整卡：归档 + 排复习（PRD 5.4 状态流转） */
  const handleFinish = () => {
    // TODO(P2)：这里应当提交应答分并由服务端推进复习排期；
    // 打分接口尚不存在，所以只做跳转，**不伪造落库**（PRD 09 / D-010）
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
              AI 已根据内容、语法、流利度与措辞完成评测
            </p>
          </header>

          <div className="flex justify-center mb-6">
            <ScoreRing score={result.score} label="应答综合分" />
          </div>

          {/* 整卡的两步分与综合分：跟读分由结果页交接过来（同一次练习） */}
          {repeatScore !== null && (
            <p
              className="text-sm text-center mb-10"
              style={{ color: 'var(--muted-foreground)' }}
            >
              跟读 {repeatScore} 分 · 应答 {result.score} 分 ·{' '}
              <strong style={{ color: 'var(--foreground)' }}>
                综合 {compositeScore(repeatScore, result.score)} 分
              </strong>
            </p>
          )}

          <div className="feedback-card mb-6">
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--foreground)' }}>
              维度评分
            </h2>
            <div className="space-y-4">
              {(Object.keys(result.dimensions) as (keyof AnswerScore['dimensions'])[]).map((k) => (
                <div key={k}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{DIMENSION_LABELS[k]}</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--brand-600)' }}>
                      {result.dimensions[k]}
                    </span>
                  </div>
                  <div className="ds-progress-track" style={{ minWidth: 0 }}>
                    <div className="ds-progress-fill" style={{ width: `${result.dimensions[k]}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

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

          <div className="feedback-card mb-8" style={{ background: 'var(--teal-50)', borderColor: 'var(--teal-200)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--teal-700)' }}>
              一句话改进建议
            </p>
            <p className="text-sm" style={{ color: 'var(--foreground)' }}>
              {result.suggestion}
            </p>
          </div>

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

          <div className="flex justify-center items-center gap-3 flex-wrap">
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
          <p className="ds-instruction">用自己的话回答，时长 30–60 秒</p>
          <button
            className={`ds-mic-btn${recorder.recording ? ' is-recording' : ''}`}
            type="button"
            aria-label={recorder.recording ? '停止录音' : '点击开始录音'}
            onClick={handleMicClick}
          >
            <span className="ds-mic-ring" aria-hidden="true" />
            {recorder.recording ? <Check size={36} /> : <Mic size={36} />}
          </button>
          <p className="ds-instruction" style={{ marginTop: '1rem' }}>
            {recorder.recording
              ? '正在录音…再次点击停止'
              : hasRecording
                ? '已录音，可回听或直接提交'
                : '点击开始录音'}
          </p>
          <div className="ds-timer">{formatTime(recorder.elapsedMs)}</div>
          {recorder.recording && transcriber.listening && (
            <p className="ds-heard-live">
              识别中…{transcriber.interim ? `「${transcriber.interim}」` : ''}
            </p>
          )}
          {/* 回听自己的回答 */}
          {!recorder.recording && <PlaybackButton src={recorder.audioUrl} label="听我的回答" />}
          {recorder.error && (
            <p className="text-sm mt-3 px-4 py-3 rounded-lg" style={{ background: 'var(--state-error-surface)', color: 'var(--state-error)' }}>
              {recorder.error}
            </p>
          )}
          {error && (
            <p className="text-sm mt-3 px-4 py-3 rounded-lg" style={{ background: 'var(--state-error-surface)', color: 'var(--state-error)' }}>
              {error}
            </p>
          )}
        </section>

        {/* 我听到的：把回答转成文本回显出来，便于确认是否被正确识别 */}
        {heard && !recorder.recording && <TranscriptCard heard={heard} />}

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
            className="ds-btn-primary"
            type="button"
            disabled={!hasRecording || submitting}
            onClick={handleSubmit}
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {submitting ? 'AI 语义评测中…' : '提交回答'}
          </button>
        </div>
        {!hasRecording && !recorder.recording && (
          <div className="text-center mt-4">
            <button
              type="button"
              className="ds-link-muted"
              style={{ background: 'none', border: 'none', fontSize: '0.8rem' }}
              onClick={handleSkipSubmit}
              disabled={submitting}
            >
              没有麦克风？跳过录音，直接查看评测结果
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
