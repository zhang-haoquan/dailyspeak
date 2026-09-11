import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Pause, Play } from 'lucide-react'

interface PlaybackButtonProps {
  /** 录音的 object URL；为空时不渲染 */
  src: string | null
  label?: string
  playingLabel?: string
  className?: string
  style?: CSSProperties
}

/**
 * 回听自己的发音。
 * - 播放时主动打断浏览器 TTS，避免「原声」和「自己的录音」叠在一起
 * - 暂停/播完回到起点，方便反复对照重听
 * - 换录音（重录）或卸载时停止播放
 *
 * <audio> 挂在文档里而不是 new Audio()，这样 useSpeech 的
 * 「播放原声前先停掉录音回放」才能选中它。
 */
export function PlaybackButton({
  src,
  label = '听我的发音',
  playingLabel = '播放中…',
  className = 'ds-playback-btn',
  style,
}: PlaybackButtonProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    setPlaying(false)
    return () => {
      audioRef.current?.pause()
    }
  }, [src])

  if (!src) return null

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      window.speechSynthesis?.cancel()
      void audio.play().catch(() => setPlaying(false))
    } else {
      audio.pause()
      audio.currentTime = 0
    }
  }

  return (
    <>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        hidden
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button
        type="button"
        className={className}
        style={style}
        onClick={toggle}
        aria-pressed={playing}
        aria-label={label}
        title={label}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
        {playing ? playingLabel : label}
      </button>
    </>
  )
}
