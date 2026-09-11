import {
  repeatScoreFromSimilarity,
  type ScenarioCard,
  type ScoreFeedback,
  type WordDiff,
} from '@dailyspeak/shared'
import { alignWords } from './asr'

/**
 * 模拟 AI 语音评测（PRD 06 章）—— **过渡模块，P2 整体删除**。
 *
 * 这是全应用最后一处"假"逻辑：分数由本地算法生成，不经服务端。
 * P2 接入腾讯云 ASR + DeepSeek 后，这里连同 `asr.ts`、`useTranscriber.ts` 一起删掉，
 * 由 `POST /api/score/repeat|answer` 取代。
 *
 * 跟读：用转写与原文做**词级比对**（相似度 / 词级错误）得出发音分，权重 100%（D-008）。
 *       没有转写结果时退化为按录音时长估算，并在反馈里如实说明是估算值。
 * 应答：以录音时长模拟大模型的语义/语法/流利度/措辞四维评分。
 */

/**
 * 过渡期的转写来源。
 * shared 的 `TranscriptSource` 只列**服务端**供应商；浏览器识别与本地模拟是
 * 这个过渡模块特有的，不该污染正式契约，所以在这里单独定义（P2 删除）。
 */
export type InterimTranscriptSource = 'browser' | 'mock'

/** 跟读结果（过渡版：transcriptSource 放宽为浏览器/本地模拟） */
export interface RepeatScore {
  score: number
  feedback: ScoreFeedback[]
  transcript?: string
  transcriptSource?: InterimTranscriptSource
  alignment?: WordDiff[]
  similarity?: number
}

/** 应答结果（过渡版） */
export interface AnswerScore {
  score: number
  dimensions: { content: number; grammar: number; fluency: number; vocabulary: number }
  feedback: ScoreFeedback[]
  suggestion: string
  transcript?: string
}

/** 平均语速参考：英文约 3.2 词/秒 */
const WPM = 3.2

function clampScore(n: number, min = 55, max = 98): number {
  return Math.round(Math.min(max, Math.max(min, n)))
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 无转写时的兜底：按「读完整句所需时长」估算 */
function scoreFromDuration(durationMs: number, card: ScenarioCard): number {
  const wordCount = card.sentence.split(/\s+/).length
  const expectedMs = (wordCount / WPM) * 1000
  const durationRatio = durationMs / expectedMs
  const durationScore =
    durationRatio < 0.5 ? 40 + durationRatio * 60 : Math.max(0, 100 - Math.abs(durationRatio - 1) * 55)
  const jitter = (Math.random() - 0.5) * 12
  return clampScore(durationScore + jitter)
}

/** 按分数与词级 diff 生成跟读反馈 */
function repeatFeedback(
  score: number,
  card: ScenarioCard,
  align: { words: WordDiff[]; similarity: number } | null,
): RepeatScore['feedback'] {
  const list: RepeatScore['feedback'] = []

  if (!align) {
    // 没有转写：如实说明这是按语速估算的
    list.push({ ok: true, text: '未拿到语音转写，本次发音分按语速时长估算' })
    list.push(
      score >= 82
        ? { ok: true, text: '语速接近原句节奏' }
        : { ok: false, text: '语速与原句差距较大，建议跟着原声再读一遍' },
    )
    return list
  }

  const wrong = align.words.filter((w) => !w.ok)
  const replaced = wrong.filter((w) => w.said)
  const missing = wrong.filter((w) => !w.said)

  if (wrong.length === 0) {
    list.push({ ok: true, text: '整句每个词都识别正确，发音清晰' })
  }
  if (replaced.length > 0) {
    const detail = replaced
      .slice(0, 3)
      .map((w) => `${w.word} → ${w.said}`)
      .join('、')
    list.push({ ok: false, text: `这几个词被听成了别的词：${detail}，发音需要再清晰一些` })
  }
  if (missing.length > 0) {
    const detail = missing
      .slice(0, 4)
      .map((w) => w.word)
      .join('、')
    list.push({ ok: false, text: `没有识别到「${detail}」，可能是漏读或连读含混` })
  }

  if (align.similarity >= 0.95) {
    list.push({ ok: true, text: '重音与连读位置基本准确' })
  } else if (align.similarity >= 0.8) {
    list.push({ ok: true, text: '整体连贯，个别词放慢重读会更清楚' })
  } else {
    list.push({ ok: false, text: `「${card.sentence.split(' ').slice(-2).join(' ')}」附近丢词较多，建议逐词跟读` })
  }

  return list
}

/**
 * 跟读打分
 * @param transcript ASR 转写文本；为空则退化为按录音时长估算
 */
export async function scoreRepeat(
  card: ScenarioCard,
  durationMs: number,
  transcript?: string,
  transcriptSource?: InterimTranscriptSource,
): Promise<RepeatScore> {
  await delay(900 + Math.random() * 700)

  const hasTranscript = !!transcript && transcript.trim().length > 0
  const align = hasTranscript ? alignWords(card.sentence, transcript!) : null
  const score = align ? repeatScoreFromSimilarity(align.similarity) : scoreFromDuration(durationMs, card)

  return {
    score,
    feedback: repeatFeedback(score, card, align),
    transcript: hasTranscript ? transcript! : undefined,
    transcriptSource: hasTranscript ? transcriptSource : undefined,
    alignment: align?.words,
    similarity: align?.similarity,
  }
}

/** 应答打分：模拟大模型语义评测（内容/语法/流利度/措辞） */
export async function scoreAnswer(
  _card: ScenarioCard,
  durationMs: number,
): Promise<AnswerScore> {
  await delay(1100 + Math.random() * 800)

  const jitter = (v: number) => clampScore(v + (Math.random() - 0.5) * 10, 55, 98)

  // 时长 30-60 秒为理想区间，太短语义不完整
  const seconds = durationMs / 1000
  let contentBase = 82
  if (seconds < 15) contentBase = 62
  else if (seconds < 30) contentBase = 74

  const dimensions = {
    content: jitter(contentBase),
    grammar: jitter(78),
    fluency: jitter(76),
    vocabulary: jitter(74),
  }
  const score = clampScore(
    dimensions.content * 0.4 +
      dimensions.grammar * 0.25 +
      dimensions.fluency * 0.2 +
      dimensions.vocabulary * 0.15,
  )

  const feedback: AnswerScore['feedback'] = []
  feedback.push({
    ok: dimensions.content >= 80,
    text:
      dimensions.content >= 80
        ? '回答切题完整，观点清晰'
        : '回答略偏离提问重点，建议先直接回应问题再展开',
  })
  feedback.push({
    ok: dimensions.grammar >= 80,
    text: dimensions.grammar >= 80 ? '语法基本准确' : '时态与主谓一致偶有错误，可多留意',
  })
  feedback.push({
    ok: dimensions.fluency >= 80,
    text: dimensions.fluency >= 80 ? '表达流利，少有犹豫' : '停顿较多，多用连接词串联思路',
  })
  feedback.push({
    ok: dimensions.vocabulary >= 80,
    text: dimensions.vocabulary >= 80 ? '措辞丰富，句型多样' : '可尝试使用更丰富的词汇与从句',
  })

  const suggestion =
    score >= 85
      ? '答得很棒！继续保持这个节奏，面试时自信开口即可。'
      : score >= 70
        ? '整体不错。建议先点题回答，再用一个例子支撑，结尾总结一句。'
        : '先把回答结构理顺：结论 → 理由/例子 → 总结，再逐次练习流畅度。'

  return { score, dimensions, feedback, suggestion, transcript: '' }
}
