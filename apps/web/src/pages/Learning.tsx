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
  TriangleAlert,
} from 'lucide-react'
import { AUDIO_LIMITS, type LearningMode, type RepeatScore } from '@dailyspeak/shared'
import { useAuth } from '../hooks/useAuth'
import { useCardDetail } from '../hooks/queries'
import { useRecorder, formatTime } from '../hooks/useRecorder'
import { useSpeech } from '../hooks/useSpeech'
import { PlaybackButton } from '../components/PlaybackButton'
import { ErrorPanel, LoadingPanel } from '../components/states'
import { TranscriptCard, type HeardResult } from '../components/TranscriptCard'
import { api } from '../services/endpoints'
import { ApiError } from '../services/http'
import { encodeToWav16kMono } from '../utils/wav'

/** 自动停止点比服务端上限略早，避免卡在边界上被判超限 */
const AUTO_STOP_MS = AUDIO_LIMITS.repeat.maxSeconds * 1000 - 500

export function LearningPage() {
  const { cardId } = useParams()
  const [searchParams] = useSearchParams()
  const mode: LearningMode = searchParams.get('mode') === 'review' ? 'review' : 'new'
  const navigate = useNavigate()
  const { logout } = useAuth()

  // 卡片内容来自服务端（PRD 08：前端不持有任何内容数据）
  const detail = useCardDetail(cardId)
  const card = detail.data?.card
  const recorder = useRecorder({ maxMs: AUTO_STOP_MS })
  const { speak } = useSpeech()

  /** 服务端评测结果；null 表示还没拿到有效结果 */
  const [result, setResult] = useState<RepeatScore | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
            返回学习台 <Check size={16} />
          </Link>
        </div>
      </div>
    )
  }

  /** 录音结束立刻上传评测：PRD 5.4 要求「录音结束后」就能看到「我听到的」 */
  const submitRecording = async (blob: Blob) => {
    setSubmitting(true)
    setError(null)
    try {
      // 腾讯云不认 webm，必须先转成 16kHz 单声道 WAV（PRD 09 音频约束）
      const clip = await encodeToWav16kMono(blob)
      const scored = await api.scoreRepeat(card.id, clip.blob)
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

  const resetRecording = () => {
    recorder.cancel()
    setResult(null)
    setError(null)
  }

  /** 录音已完成（无论打分成功与否） */
  const hasRecording = recorder.audioUrl !== null && !recorder.recording

  const heard: HeardResult | null =
    result && result.transcript && result.transcriptSource
      ? {
          text: result.transcript,
          source: result.transcriptSource,
          alignment: result.alignment,
          similarity: result.similarity,
          notice: result.degraded ? result.degradedReason : undefined,
        }
      : null

  const handleFinish = () => {
    if (!result) return
    navigate(`/result/${card.id}?mode=${mode}`, {
      state: { repeatScore: result, mode, audioUrl: recorder.handoff() },
    })
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
            <span>
              点击下方录音按钮，模仿原音大声跟读（
              {AUDIO_LIMITS.repeat.minSeconds}–{AUDIO_LIMITS.repeat.maxSeconds} 秒）
            </span>
          </div>
        </article>

        <section className="ds-record-section">
          <p className="ds-instruction">
            {recorder.recording
              ? '录音中，请大声跟读…'
              : submitting
                ? '正在评测…'
                : hasRecording
                  ? result?.degraded
                    ? '已录音，本次未产生打分'
                    : '已录音，可回听、查看识别结果或直接完成'
                  : '点击录音，大声跟读'}
          </p>
          <button
            className={`ds-mic-btn${recorder.recording ? ' is-recording' : ''}`}
            aria-label={recorder.recording ? '停止录音' : '开始录音'}
            type="button"
            onClick={handleMicClick}
            disabled={submitting}
          >
            <span className="ds-mic-ring" aria-hidden="true" />
            {recorder.recording ? <Check size={36} /> : <Mic size={36} />}
          </button>
          <div className="ds-timer">{formatTime(recorder.elapsedMs)}</div>

          {/* 回听自己的发音：录音完成后可反复播放，对照原声找差距 */}
          {!recorder.recording && <PlaybackButton src={recorder.audioUrl} />}

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

          {recorder.autoStopped && (
            <p className="ds-heard-notice">
              已到 {AUDIO_LIMITS.repeat.maxSeconds} 秒上限，自动停止录音
            </p>
          )}

          {/* 降级说明：第三方不可用时如实告知「本次不打分」，不伪造分数 */}
          {result?.degraded && (
            <div className="ds-alert" style={{ marginTop: '1rem' }}>
              <TriangleAlert size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{result.degradedReason ?? '本次未产生打分'}</span>
            </div>
          )}

          {recorder.error && (
            <p
              className="text-sm mt-3 px-4 py-3 rounded-lg"
              style={{ background: 'var(--state-error-surface)', color: 'var(--state-error)' }}
            >
              {recorder.error}
            </p>
          )}
          {!recorder.supported && (
            <p
              className="text-sm mt-3 px-4 py-3 rounded-lg"
              style={{ background: 'var(--state-error-surface)', color: 'var(--state-error)' }}
            >
              当前浏览器不支持录音，请使用 Chrome / Edge / Safari 最新版。
              <br />
              没有麦克风也可以直接看原句与中文释义练习，本次不计分。
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

        {/* 我听到的：服务端 ASR 转写 + 逐词对照原句（PRD 5.4 v0.2） */}
        {heard && !recorder.recording && (
          <TranscriptCard heard={heard} compareLabel="对比原句" />
        )}
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
            disabled={!hasRecording}
            onClick={resetRecording}
            style={!hasRecording ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
          >
            <RotateCcw size={16} />
            重录
          </button>
          {/* PRD 09：录音失败/权限被拒时允许不录音直接过（不计分，不伪造分数） */}
          <Link
            to="/"
            className="ds-btn-ghost"
            style={{ textDecoration: 'none' }}
            title="本次不计分，卡片会留在今日任务里"
          >
            跳过跟读（不计分）
          </Link>
          <button
            className="ds-btn-primary"
            type="button"
            disabled={!result || submitting}
            onClick={handleFinish}
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {submitting ? 'AI 评测中…' : '完成'}
          </button>
        </div>
      </div>
    </main>
  )
}
