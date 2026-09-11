interface ScoreRingProps {
  score: number | null
  label: string
  /** 未打分时显示的占位符 */
  placeholder?: string
  size?: number
}

/** 渐变分数环（设计稿 Result 页） */
export function ScoreRing({ score, label, placeholder = '—', size = 160 }: ScoreRingProps) {
  const r = 74
  const circumference = 2 * Math.PI * r
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score))
  const dashoffset = circumference - (circumference * pct) / 100
  const color = score === null ? 'var(--muted-foreground)' : 'var(--foreground)'

  return (
    <div className="flex flex-col items-center">
      <div className="score-ring-wrap" style={{ width: size, height: size }}>
        <svg className="score-ring-svg" viewBox="0 0 160 160" role="img" aria-label={`${label}${score !== null ? ` ${score} 分` : ' 待完成'}`}>
          <defs>
            <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--brand-500)"></stop>
              <stop offset="100%" stopColor="var(--teal-500)"></stop>
            </linearGradient>
          </defs>
          <circle className="score-ring-track" cx="80" cy="80" r={r} />
          {score !== null && (
            <circle
              className="score-ring-value"
              cx="80"
              cy="80"
              r={r}
              strokeDasharray={circumference}
              strokeDashoffset={dashoffset}
            />
          )}
        </svg>
        <div className="score-ring-overlay">
          <span
            className="text-4xl font-bold"
            style={{ color, fontSize: score === null ? '2.25rem' : '2.5rem' }}
          >
            {score === null ? placeholder : score}
          </span>
        </div>
      </div>
      <span className="text-sm mt-3" style={{ color: 'var(--muted-foreground)' }}>
        {label}
      </span>
    </div>
  )
}
