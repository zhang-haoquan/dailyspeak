import { useCallback, useEffect, useRef, useState } from 'react'
import { browserAsrAllowed, browserAsrSupported } from '../services/asr'

/**
 * 浏览器原生语音转写（SpeechRecognition）—— 与 MediaRecorder 并行工作。
 *
 * 录音的同时实时识别，结束后拿到最终文本，用于：
 *  - 在学习页回显「我听到的」
 *  - 与原文做词级比对，得出跟读发音分（PRD 06 章）
 *
 * 注意：Chrome / Edge 的实现依赖在线语音服务，离线或网络受限时会触发
 * error='network'，此时不报错打断用户，交给 mock 兜底。
 */
export function useTranscriber() {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const finalRef = useRef('')
  const endResolveRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    setSupported(browserAsrAllowed())
    return () => {
      try {
        recRef.current?.abort()
      } catch {
        /* 忽略 */
      }
      recRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    finalRef.current = ''
    setInterim('')
    setError(null)
  }, [])

  const start = useCallback(() => {
    if (!browserAsrAllowed()) return
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Ctor) return

    reset()
    try {
      const rec = new Ctor()
      rec.lang = 'en-US'
      rec.continuous = true
      rec.interimResults = true
      rec.maxAlternatives = 1

      rec.onstart = () => setListening(true)

      rec.onresult = (e) => {
        let live = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i]
          const text = result[0]?.transcript ?? ''
          if (result.isFinal) finalRef.current += ` ${text}`
          else live += text
        }
        setInterim(live.trim())
      }

      rec.onerror = (e) => {
        // no-speech / aborted 属于正常停止，不打扰用户
        if (e.error === 'no-speech' || e.error === 'aborted') return
        setError(
          e.error === 'network'
            ? '浏览器在线识别不可用（网络受限），已改用本地模拟转写'
            : e.error === 'not-allowed' || e.error === 'service-not-allowed'
              ? '未获得语音识别权限，已改用本地模拟转写'
              : '语音识别出错，已改用本地模拟转写',
        )
      }

      rec.onend = () => {
        setListening(false)
        setInterim('')
        endResolveRef.current?.()
        endResolveRef.current = null
      }

      recRef.current = rec
      rec.start()
    } catch {
      setError('语音识别启动失败，已改用本地模拟转写')
    }
  }, [reset])

  /** 停止并返回最终转写文本（等 onend，最多 900ms） */
  const stop = useCallback(async (): Promise<string> => {
    const rec = recRef.current
    if (!rec) return finalRef.current.trim()
    await new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve()
      }
      endResolveRef.current = finish
      try {
        rec.stop()
      } catch {
        finish()
      }
      window.setTimeout(finish, 900)
    })
    endResolveRef.current = null
    setListening(false)
    setInterim('')
    return finalRef.current.trim()
  }, [])

  const abort = useCallback(() => {
    try {
      recRef.current?.abort()
    } catch {
      /* 忽略 */
    }
    recRef.current = null
    setListening(false)
    setInterim('')
    reset()
  }, [reset])

  return {
    supported,
    /** 浏览器是否支持该能力（忽略用户偏好） */
    capability: browserAsrSupported(),
    listening,
    interim,
    error,
    start,
    stop,
    abort,
    reset,
  }
}
