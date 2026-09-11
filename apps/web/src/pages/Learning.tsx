import { useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import {
  Languages,
  Laptop,
  Repeat,
  MessageCircle,
  Volume2,
  Mic,
  CirclePlay,
  RotateCcw,
  Check,
  Loader2,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useRecorder, formatTime } from '../hooks/useRecorder'
import { useTranscriber } from '../hooks/useTranscriber'
import { useSpeech } from '../hooks/useSpeech'
import { PlaybackButton } from '../components/PlaybackButton'
import { TranscriptCard, type HeardResult } from '../components/TranscriptCard'
import * as api from '../services/api'
import { alignWords, mockTranscript } from '../services/asr'
import { scoreRepeat } from '../services/scoring'

export function LearningPage() {
  const { cardId } = useParams()
  const [searchParams] = useSearchParams()
  const mode = (searchParams.get('mode') as 'new' | 'review') || 'new'
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const card = api.getCardById(cardId ?? '')
  const recorder = useRecorder()
  const transcriber = useTranscriber()
  const { speak } = useSpeech()

  const [hasRecording, setHasRecording] = useState(false)
  const [heard, setHeard] = useState<HeardResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!card) {
    return (
      <div className="ds-center-page">
        <div className="ds-card text-center" style={{ maxWidth: 360 }}>
          <p className="font-semibold mb-2">未找到该卡片</p>
          <Link to="/" className="ds-link-primary mx-auto">
            返回学习台 <Check size={16} />
          </Link>
        </div>
      </div>
    )
  }

  /**
   * 拿到「我听到的」：优先用浏览器真实转写；
   * 不支持或识别失败时用本地模拟转写兜底，并在卡片上标注来源。
   */
  const buildHeard = (transcript: string, durationMs: number, notice?: string): HeardResult => {
    const real = transcript.trim()
    const text = real || mockTranscript(card.sentence, durationMs)
    const source: HeardResult['source'] = real ? 'browser' : 'mock'
    const align = alignWords(card.sentence, text)
    return {
      text,
      source,
      alignment: align.words,
      similarity: align.similarity,
      notice,
    }
  }

  const handleMicClick = async () => {
    setError(null)
    if (recorder.recording) {
      // 注意：recorder.elapsedMs 是上一次渲染的快照，必须用 stop() 的返回值
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

  const resetRecording = () => {
    recorder.cancel()
    transcriber.abort()
    setHasRecording(false)
    setHeard(null)
  }

  const handleSubmit = async () => {
    if (!hasRecording || submitting || !user) return
    setSubmitting(true)
    try {
      // 模拟上传录音 → 后端评测（PRD 06 章）
      const result = await scoreRepeat(
        card,
        recorder.elapsedMs || 3000,
        heard?.text,
        heard?.source,
      )
      api.submitRepeatScore(user.id, card.id, result.score, mode)
      // 把回听地址与转写结果交给结果页，方便对照反馈复听
      const audioUrl = recorder.handoff()
      navigate(`/result/${card.id}?mode=${mode}`, {
        state: { repeatScore: result, mode, audioUrl },
      })
    } catch {
      setError('评测服务暂时不可用，请稍后重试')
      setSubmitting(false)
    }
  }

  /** PRD 09：无麦克风/权限被拒时的兜底——不录音直接模拟完成 */
  const handleSkip = async () => {
    if (submitting || !user) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await scoreRepeat(card, 3000)
      api.submitRepeatScore(user.id, card.id, result.score, mode)
      navigate(`/result/${card.id}?mode=${mode}`, {
        state: { repeatScore: result, mode, audioUrl: recorder.handoff() },
      })
    } catch {
      setError('评测服务暂时不可用，请稍后重试')
      setSubmitting(false)
    }
  }

  return (
    <main>
      <nav className="ds-nav" aria-label="Primary">
        <div className="ds-nav-inner" style={{ maxWidth: '48rem' }}>
          <Link to="/" className="ds-logo">
            <Languages size={20} style={{ color: 'var(--brand-500)' }} />
            DailySpeak
          </Link>
          <button className="ds-link-muted" onClick={logout} style={{ background: 'none', border: 'none' }}>
            <LogOut size={15} />
            退出
          </button>
        </div>
      </nav>

      <div className="ds-container" style={{ maxWidth: '48rem' }}>
        <div className="ds-tag-row">
          <span className="ds-domain-tag">
            <Laptop size={12} style={{ marginRight: 6 }} />
            {card.domain}
          </span>
          <span className="ds-step-tag">
            <Repeat size={12} style={{ marginRight: 6 }} />
            跟读
          </span>
        </div>

        <article className="ds-sentence-card">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
            <div
              style={{
                display: 'flex',
                width: '2.25rem',
                height: '2.25rem',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 999,
                background: 'var(--gradient-soft)',
                flexShrink: 0,
              }}
            >
              <MessageCircle size={16} style={{ color: 'var(--brand-600)' }} />
            </div>
            <div>
              <div className="ds-eyebrow">{card.tag}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: 2 }}>
                {card.sceneText} · {card.sceneZh}
              </div>
            </div>
          </div>
          <p className="ds-sentence-en">{card.sentence}</p>
          <p className="ds-sentence-zh">{card.translation}</p>
          <div
            style={{
              marginTop: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.75rem',
              color: 'var(--muted-foreground)',
            }}
          >
            <Volume2 size={14} />
            <span>点击下方录音按钮，模仿原音大声跟读</span>
          </div>
        </article>

        <section className="ds-record-section">
          <p className="ds-instruction">
            {recorder.recording
              ? '录音中，请大声跟读…'
              : hasRecording
                ? '已录音，可回听、查看识别结果或直接完成'
                : '点击录音，大声跟读'}
          </p>
          <button
            className={`ds-mic-btn${recorder.recording ? ' is-recording' : ''}`}
            aria-label={recorder.recording ? '停止录音' : '开始录音'}
            type="button"
            onClick={handleMicClick}
          >
            <span className="ds-mic-ring" aria-hidden="true" />
            {recorder.recording ? <Check size={36} /> : <Mic size={36} />}
          </button>
          <div className="ds-timer">{formatTime(recorder.elapsedMs)}</div>
          {recorder.recording && transcriber.listening && (
            <p className="ds-heard-live">
              识别中…{transcriber.interim ? `「${transcriber.interim}」` : ''}
            </p>
          )}
          {/* 回听自己的发音：录音完成后可反复播放，对照原声找差距 */}
          {!recorder.recording && (
            <PlaybackButton src={recorder.audioUrl} />
          )}
          {recorder.recording && (
            <div className="ds-rec-status">
              <span className="ds-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span>录音中...</span>
            </div>
          )}
          {recorder.error && (
            <p className="text-sm mt-3 px-4 py-3 rounded-lg" style={{ background: 'var(--state-error-surface)', color: 'var(--state-error)' }}>
              {recorder.error}
            </p>
          )}
          {!recorder.supported && (
            <p className="text-sm mt-3 px-4 py-3 rounded-lg" style={{ background: 'var(--state-error-surface)', color: 'var(--state-error)' }}>
              当前浏览器不支持录音，请使用 Chrome / Edge / Safari 最新版，或点击下方「跳过录音」查看流程。
            </p>
          )}
          {!hasRecording && !recorder.recording && (
            <button
              type="button"
              className="ds-link-muted"
              style={{ marginTop: '1rem', background: 'none', border: 'none', fontSize: '0.8rem' }}
              onClick={handleSkip}
              disabled={submitting}
            >
              没有麦克风？跳过录音，直接完成跟读
            </button>
          )}
          {error && (
            <p className="text-sm mt-3 px-4 py-3 rounded-lg" style={{ background: 'var(--state-error-surface)', color: 'var(--state-error)' }}>
              {error}
            </p>
          )}
        </section>

        {/* 我听到的：把用户说的话转成文本回显，并逐词对照原句（PRD 06 章） */}
        {heard && !recorder.recording && <TranscriptCard heard={heard} compareLabel="对比原句" />}
      </div>

      <div className="ds-bottom">
        <div className="ds-bottom-inner" style={{ maxWidth: '48rem' }}>
          <button className="ds-btn-ghost" type="button" onClick={() => speak(card.sentence)}>
            <CirclePlay size={16} />
            重听原声
          </button>
          <button
            className="ds-btn-ghost"
            type="button"
            disabled={!hasRecording && !recorder.recording}
            onClick={resetRecording}
            style={!hasRecording && !recorder.recording ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
          >
            <RotateCcw size={16} />
            重录
          </button>
          <button
            className="ds-btn-primary"
            type="button"
            disabled={!hasRecording || submitting}
            onClick={handleSubmit}
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {submitting ? 'AI 评测中…' : '完成'}
          </button>
        </div>
      </div>
    </main>
  )
}
