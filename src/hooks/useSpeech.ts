import { useCallback, useRef, useState } from 'react'

/**
 * 浏览器 TTS（重听原声 / 重听题目），生产环境可替换为服务端合成的参考音频。
 */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false)
  const voiceRef = useRef<SpeechSynthesisUtterance | null>(null)

  const speak = useCallback((text: string, rate = 0.92) => {
    if (!('speechSynthesis' in window)) return
    // 正在回听自己的录音时先停掉，否则两路音频会叠在一起
    document.querySelectorAll('audio').forEach((a) => a.pause())
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = rate
    // 优先选择英语男声/默认声线，让演示更接近原音
    const voices = window.speechSynthesis.getVoices()
    const en = voices.find((v) => v.lang.startsWith('en') && /male|Daniel|Google US English/i.test(v.name))
    if (en) u.voice = en
    u.onstart = () => setSpeaking(true)
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    voiceRef.current = u
    window.speechSynthesis.speak(u)
  }, [])

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel()
    setSpeaking(false)
  }, [])

  return { speak, stop, speaking }
}
