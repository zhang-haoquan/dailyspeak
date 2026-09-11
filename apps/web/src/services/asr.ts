/**
 * ASR（语音转文字）供应商抽象 —— PRD 06 / 08 章
 *
 * 目标链路：录音 → 转写 → 与原文做词级比对（相似度 / WER）→ 跟读发音分。
 * 生产环境把录音上传后端，由通义千问 / 豆包 ASR 返回文本即可，
 * 前端只需要替换这里的 provider，比对与打分逻辑（本文件 + scoring.ts）不用动。
 *
 * 当前工程还没有后端，因此提供两个可替换实现：
 *  - browser：浏览器原生 SpeechRecognition（Chrome / Edge，需要联网）
 *             拿到的是**真实转写**
 *  - mock   ：本地模拟转写，用于离线演示与走通链路，
 *             界面上会明确标注「模拟」，不要当成真实识别结果
 *
 * 切换供应商：setAsrPreference('auto' | 'browser' | 'mock')
 */

export type AsrSource = 'browser' | 'mock'
export type AsrPreference = 'auto' | 'browser' | 'mock'

const PREF_KEY = 'dailyspeak:asrProvider'

export function getAsrPreference(): AsrPreference {
  try {
    const raw = localStorage.getItem(PREF_KEY)
    return raw === 'browser' || raw === 'mock' ? raw : 'auto'
  } catch {
    return 'auto'
  }
}

export function setAsrPreference(pref: AsrPreference): void {
  try {
    localStorage.setItem(PREF_KEY, pref)
  } catch {
    /* localStorage 不可用时忽略 */
  }
}

/** 浏览器是否具备原生转写能力（与用户偏好无关） */
export function browserAsrSupported(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

/** 本次会话是否启用浏览器原生转写 */
export function browserAsrAllowed(): boolean {
  const pref = getAsrPreference()
  if (pref === 'mock') return false
  return browserAsrSupported()
}

// ---------- 词级比对 ----------

export interface WordDiff {
  /** 原句里的词（已归一化） */
  word: string
  /** 识别到的对应词；null 表示没识别到 */
  said: string | null
  ok: boolean
}

export interface AlignResult {
  words: WordDiff[]
  matched: number
  total: number
  /** 词级相似度 0–1 */
  similarity: number
}

/** 归一化单词：小写、去掉标点，只保留字母/数字/撇号 */
export function normalizeWord(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9']/g, '')
}

export function tokenize(text: string): string[] {
  return text.split(/\s+/).map(normalizeWord).filter(Boolean)
}

/**
 * 最长公共子序列对齐，得到词级 diff：
 * - 对齐上的词 → ok
 * - 原句有、转写没有 → 漏读或读错（若能配上相邻的转写词，则记为「读成了 X」）
 * - 转写多出来的词 → 忽略（跟读场景只关心原句有没有读全）
 */
export function alignWords(target: string, transcript: string): AlignResult {
  const a = tokenize(target)
  const b = tokenize(transcript)
  const n = a.length
  const m = b.length

  // dp[i][j] = LCS(a[i:], b[j:])
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const words: WordDiff[] = []
  let i = 0
  let j = 0
  let matched = 0

  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      words.push({ word: a[i], said: b[j], ok: true })
      matched++
      i++
      j++
      continue
    }
    // 原句这个词没被正确读出
    if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) {
      // 只有转写里的这个词在**后面的原句里也不再出现**时，才认定为「读成了它」。
      // 否则要继续留给后面那个词去匹配——否则贪心替换会一路把正确的词全部带偏
      // （例：原句「could you walk…」识别成「you walk…」，若把 you 配给 could，
      //   后面 all 都匹配不上，准确度会被算成 0%）。
      const candidate = j < m ? b[j] : null
      const substitute = candidate && !a.slice(i + 1).includes(candidate) ? candidate : null
      words.push({ word: a[i], said: substitute, ok: false })
      i++
      if (substitute) j++
      continue
    }
    j++ // 多读的词，跳过
  }

  return {
    words,
    matched,
    total: n,
    similarity: n === 0 ? 1 : matched / n,
  }
}

// ---------- 模拟转写（离线兜底） ----------

/** 常见的「听错」词表，让模拟结果看起来像真的识别错误 */
const CONFUSIONS: Record<string, string[]> = {
  the: ['a', 'thee'],
  a: ['the'],
  and: ['end', 'an'],
  to: ['two', 'too'],
  of: ['off'],
  in: ['on'],
  is: ['it'],
  it: ['is'],
  for: ['four', 'from'],
  with: ['which'],
  am: ['and'],
  my: ['me'],
  our: ['are'],
  are: ['our'],
  work: ['walk'],
  would: ['wood'],
  will: ['well'],
  led: ['lead'],
  cut: ['cat'],
  role: ['roll'],
  great: ['grade'],
  three: ['tree'],
  years: ['year'],
  really: ['real'],
  enjoy: ['enjoyed'],
  solving: ['solvent'],
  problems: ['problem'],
  time: ['times'],
  use: ['used'],
  developer: ['develop'],
  experience: ['experiences'],
  project: ['projects'],
}

/** 线性同余伪随机：同一个种子得到同一结果，便于复现和测试 */
function lcg(seed: number): () => number {
  let s = Math.floor(Math.abs(seed)) % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

function confuse(word: string, rnd: () => number): string {
  const bare = normalizeWord(word)
  const options = CONFUSIONS[bare]
  if (options && options.length > 0) {
    return options[Math.floor(rnd() * options.length) % options.length]
  }
  if (bare.length > 5 && bare.endsWith('ing')) return `${bare.slice(0, -3)}in`
  if (bare.length > 4 && bare.endsWith('e')) return bare.slice(0, -1)
  if (bare.length > 3) return `${bare.slice(0, -1)}e`
  return bare
}

/**
 * 模拟转写：按 errorRate 的概率漏词/听错词，模拟真实 ASR 的识别误差。
 * seed 用录音时长，保证同一段录音结果稳定。
 */
export function mockTranscript(target: string, seed: number, errorRate = 0.18): string {
  const words = target.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const rnd = lcg(seed || 1)
  const out: string[] = []
  for (const w of words) {
    const r = rnd()
    if (r < errorRate * 0.45) continue // 漏读
    if (r < errorRate) out.push(confuse(w, rnd)) // 读错
    else out.push(w)
  }
  return out.join(' ') || words[0]
}
