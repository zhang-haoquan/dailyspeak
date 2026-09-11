import { useCallback, useEffect, useRef, useState } from 'react'

export interface RecorderOptions {
  /**
   * 最长录音时长，到点自动停止。
   *
   * 服务端对跟读（3–15s）与应答（30–60s）有硬性时长窗口，超了直接拒绝。
   * 与其让用户录到 40 秒再被拒一次，不如到点自动收工。
   * 调用方应传**略小于**上限的值（如 14_500），因为计时器是 200ms 一跳，
   * 且编码后的音频长度由实际数据决定，卡在边界上容易被判超限。
   */
  maxMs?: number
}

/**
 * 浏览器录音 Hook（MediaRecorder / WebRTC，PRD 08 章）
 * - start() 开始采集麦克风
 * - stop() 结束并返回原始 Blob 与录音时长，同时产出可回听的 audioUrl
 * - cancel() 丢弃本次录音（连同回听地址）
 * - handoff() 把回听地址交给下一页（结果页对照反馈回听），卸载时不再回收
 * - 兼容移动端 Safari（audio/mp4 兜底）
 *
 * 注意：这里产出的还是浏览器原生格式（Chrome 是 webm），
 * 上传前必须用 `utils/wav.ts` 转成 16kHz 单声道 WAV——腾讯云不认 webm。
 */
export function useRecorder(options: RecorderOptions = {}) {
  const [recording, setRecording] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [supported, setSupported] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  /** 最近一次是否是「到点自动停的」，用于界面上说明原因 */
  const [autoStopped, setAutoStopped] = useState(false)

  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const urlRef = useRef<string | null>(null)
  /** 回听地址已交给下一页，卸载时不能回收 */
  const handedOffRef = useRef(false)
  const aliveRef = useRef(true)
  /** 计时器里要调 stop，用 ref 避免循环依赖 */
  const stopRef = useRef<(() => Promise<unknown>) | null>(null)
  const maxMsRef = useRef(options.maxMs)
  maxMsRef.current = options.maxMs

  /** 回收上一段录音的 object URL（反复重录时不留垃圾） */
  const releaseUrl = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    handedOffRef.current = false
    setAudioUrl(null)
  }, [])

  useEffect(() => {
    // StrictMode 下会 mount → unmount → mount，这里必须重置
    aliveRef.current = true
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false)
    }
    return () => {
      aliveRef.current = false
      // 卸载：停掉麦克风与计时器
      if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      // 已交接给下一页播放的 URL 保持有效，其余回收
      if (urlRef.current && !handedOffRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    setError(null)
    releaseUrl() // 开始新录音，丢弃上一段回听地址
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })
      streamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.start()
      mediaRef.current = rec
      startRef.current = Date.now()
      setElapsedMs(0)
      setAutoStopped(false)
      setRecording(true)
      timerRef.current = window.setInterval(() => {
        const ms = Date.now() - startRef.current
        setElapsedMs(ms)
        const max = maxMsRef.current
        if (max && ms >= max && mediaRef.current?.state === 'recording') {
          setAutoStopped(true)
          void stopRef.current?.()
        }
      }, 200)
    } catch {
      setError('无法访问麦克风，请检查浏览器权限设置后重试')
      setRecording(false)
    }
  }, [releaseUrl])

  const stop = useCallback(async (): Promise<{ blob: Blob; durationMs: number } | null> => {
    if (!mediaRef.current) return null
    return new Promise((resolve) => {
      const rec = mediaRef.current!
      const durationMs = Date.now() - startRef.current
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || 'audio/webm',
        })
        chunksRef.current = []
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
        setRecording(false)
        setElapsedMs(durationMs)
        if (!aliveRef.current) {
          resolve(null)
          return
        }
        // 产出回听地址（先回收上一段）
        releaseUrl()
        urlRef.current = URL.createObjectURL(blob)
        setAudioUrl(urlRef.current)
        resolve({ blob, durationMs })
      }
      rec.stop()
    })
  }, [releaseUrl])

  /** 取消录音（丢弃音频与回听地址） */
  const cancel = useCallback(() => {
    if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setRecording(false)
    setElapsedMs(0)
    setAutoStopped(false)
    releaseUrl()
  }, [releaseUrl])

  // 计时器里要按上限自动停，把最新的 stop 挂到 ref 上
  stopRef.current = stop

  /** 把回听地址交接给下一页，返回该地址（无录音时为 null） */
  const handoff = useCallback(() => {
    handedOffRef.current = true
    return urlRef.current
  }, [])

  return {
    recording,
    elapsedMs,
    supported,
    error,
    audioUrl,
    /** 本次录音是到达时长上限被自动停止的 */
    autoStopped,
    start,
    stop,
    cancel,
    handoff,
  }
}

/** 格式化毫秒为 mm:ss */
export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = String(Math.floor(total / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${m}:${s}`
}
