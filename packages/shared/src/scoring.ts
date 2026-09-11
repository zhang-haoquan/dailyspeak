/**
 * AI 语音评测的返回契约（PRD 06 章）
 *
 * 跟读分完全由 ASR 转写与原句的词级相似度决定（权重 100%，见 docs/DECISIONS.md D-008），
 * 因此跟读结果里必须带上转写与逐词对齐，前端才能渲染「我听到的」与逐词对照（D-009）。
 */

/** ASR 转写来源，界面上要如实标注，不允许用模拟文本顶替 */
export type TranscriptSource = 'whisper-local' | 'qwen-paraformer' | 'volcengine-asr' | 'xfyun-asr'

/** 逐词对齐结果 */
export interface WordDiff {
  /** 原句里的词（已归一化：小写、去标点） */
  word: string
  /** 识别到的对应词；null 表示没识别到 */
  said: string | null
  ok: boolean
}

/** 一条反馈 */
export interface ScoreFeedback {
  ok: boolean
  text: string
}

/** 跟读打分结果 */
export interface RepeatScore {
  score: number
  feedback: ScoreFeedback[]
  /** ASR 转写文本（「我听到的」） */
  transcript?: string
  /** 产生该文本的 ASR 供应商 */
  transcriptSource?: TranscriptSource
  /** 词级对齐，用于逐词对照原句 */
  alignment?: WordDiff[]
  /** 词级相似度 0–1 */
  similarity?: number
  /** 是否因第三方失败而只记完成、未打分（PRD 09 章降级） */
  degraded?: boolean
}

/** 应答评测的四个维度（PRD 06 章权重：内容 40 / 语法 25 / 流利度 20 / 措辞 15） */
export interface AnswerDimensions {
  content: number
  grammar: number
  fluency: number
  vocabulary: number
}

/** 应答打分结果 */
export interface AnswerScore {
  score: number
  dimensions: AnswerDimensions
  feedback: ScoreFeedback[]
  /** 一句话改进建议 */
  suggestion: string
  transcript?: string
  transcriptSource?: TranscriptSource
  /** 是否因第三方失败而只记完成、未打分 */
  degraded?: boolean
}

/** 评测环节 */
export type ScoreKind = 'repeat' | 'answer'

export const ANSWER_DIMENSION_WEIGHTS: Readonly<Record<keyof AnswerDimensions, number>> = {
  content: 0.4,
  grammar: 0.25,
  fluency: 0.2,
  vocabulary: 0.15,
} as const

/** 综合分权重：跟读与应答各占一半（PRD 5.5） */
export const REPEAT_WEIGHT = 0.5
export const ANSWER_WEIGHT = 0.5

/**
 * 综合分 = 跟读 × 0.5 + 应答 × 0.5（PRD 5.5）。
 * 排期推进与历史展示都用它，所以放在 shared，前后端与各处展示只保留这一份口径。
 */
export function compositeScore(repeatScore: number, answerScore: number): number {
  return Math.round(repeatScore * REPEAT_WEIGHT + answerScore * ANSWER_WEIGHT)
}

/**
 * 词级相似度 → 跟读分。
 * 100% 词准 ≈ 98 分；约 72% 词准 ≈ 85 分（PASS_THRESHOLD）；0% ≈ 52 分。
 * 前后端共用同一个映射，避免展示分与存储分不一致。
 */
export function repeatScoreFromSimilarity(similarity: number): number {
  const raw = Math.round(52 + similarity * 46)
  return Math.min(98, Math.max(40, raw))
}
