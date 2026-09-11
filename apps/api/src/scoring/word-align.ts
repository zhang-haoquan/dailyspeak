/**
 * 词级对齐（PRD 6 章「跟读评分算法」）
 *
 * 原来是前端 `services/asr.ts` 里的实现，P2 下沉到后端：
 * 分数是**要落库**的，算法留在客户端等于把评分权交给用户。
 *
 * 纯函数、无副作用、可单测。
 */
import type { WordDiff } from '@dailyspeak/shared'

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

/** 切词并归一化，顺带丢掉空串（连续空格、纯标点都会产生空串） */
export function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean)
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
      // 否则要继续留给后面那个词去匹配——不然贪婪替换会一路把正确的词全部带偏：
      // 例：原句「could you walk…」识别成「you walk…」，若把 you 配给 could，
      //     后面全都匹配不上，词级准确度会被算成 0%。
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
    // 原句为空时视为完全一致；正常不会发生（内容库的句子里一定有词）
    similarity: n === 0 ? 1 : matched / n,
  }
}
