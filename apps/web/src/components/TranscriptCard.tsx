import { Fragment } from 'react'
import type { WordDiff } from '../types'

export interface HeardResult {
  /** 转写文本 */
  text: string
  /** 转写来源：browser=浏览器真实识别，mock=本地模拟 */
  source: 'browser' | 'mock'
  /** 词级对齐（跟读时用来对照原句） */
  alignment?: WordDiff[]
  similarity?: number
  /** 需要提示用户的信息，例如在线识别不可用 */
  notice?: string
}

interface TranscriptCardProps {
  heard: HeardResult
  /** 词级对照区的标题，如「对比原句」；不传则不显示对照区 */
  compareLabel?: string
  className?: string
}

/**
 * 把用户说的话转成文本回显出来。
 * 跟读场景额外给出逐词对照，读错/漏读的词高亮标出。
 */
export function TranscriptCard({ heard, compareLabel, className }: TranscriptCardProps) {
  const hasDiff = !!compareLabel && !!heard.alignment && heard.alignment.length > 0
  const accuracy = heard.similarity == null ? null : Math.round(heard.similarity * 100)

  return (
    <article className={className ?? 'ds-heard-card'}>
      <div className="ds-heard-head">
        <span className="ds-eyebrow">我听到的</span>
        <span className={`ds-asr-badge ${heard.source === 'browser' ? 'is-browser' : 'is-mock'}`}>
          {heard.source === 'browser' ? '浏览器实时转写' : '模拟转写（演示）'}
        </span>
      </div>

      <p className="ds-heard-text">
        {heard.text || <span className="ds-heard-empty">（没有识别到任何内容，请靠近麦克风重试）</span>}
      </p>

      {hasDiff && (
        <>
          <div className="ds-heard-divider" />
          <span className="ds-eyebrow">{compareLabel}</span>
          <p className="ds-heard-diff">
            {heard.alignment!.map((w, i) => (
              <Fragment key={`${w.word}-${i}`}>
                {/* span 之间必须显式补空格，否则所有词会挤成一串 */}
                {i > 0 && ' '}
                <span
                  className={w.ok ? 'is-ok' : 'is-bad'}
                  title={w.ok ? '识别正确' : w.said ? `被听成了「${w.said}」` : '没有识别到'}
                >
                  {w.word}
                </span>
              </Fragment>
            ))}
          </p>
          {accuracy != null && (
            <p className="ds-heard-meta">
              词级准确度 {accuracy}%（{heard.alignment!.filter((w) => w.ok).length}/
              {heard.alignment!.length} 个词识别正确）
            </p>
          )}
        </>
      )}

      {heard.notice && <p className="ds-heard-notice">{heard.notice}</p>}
    </article>
  )
}
