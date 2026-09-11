/**
 * 接口契约（前后端共用）
 *
 * 统一响应与错误格式，见 docs/DECISIONS.md 的技术选型：
 *   API 前缀 /api，错误格式 { code, message, details? }
 *
 * 【v0.3】P1 S3 补齐业务接口的返回契约，详见 docs/prd/PRD.md 07 章：
 *   GET /api/cards/:id  → CardDetail
 *   GET /api/today      → TodayPlanResponse
 *   GET /api/history    → HistoryStats
 */

import type { ScenarioCard } from './domain'
import type { LearningMode, TodayCard } from './learning'

/** 服务端统一错误码 */
export const API_ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UPSTREAM_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES]

/** 统一错误响应体 */
export interface ApiErrorBody {
  code: ApiErrorCode
  message: string
  /** 字段级错误详情，键为字段名 */
  details?: Record<string, string>
}

// ---------- GET /api/cards/:id ----------

/** 用户在某张卡上的学习进度（没学过则为 null） */
export interface CardProgressView {
  repeatScore: number | null
  answerScore: number | null
  composite: number | null
  /** ISO 时间串 */
  doneAt: string
  mode: LearningMode
}

/** 用户在某张卡上的复习排期（未入队则为 null） */
export interface CardReviewView {
  /** 当前阶段 1–6 */
  stage: number
  /** ISO 时间串 */
  dueAt: string
  lastScore: number
  timesReviewed: number
}

/**
 * 卡片详情。
 * 学习页/结果页一次请求拿齐「内容 + 我的进度 + 我在哪个复习阶段」，
 * 避免前端为了渲染一张卡串行打三个接口。
 */
export interface CardDetail {
  card: ScenarioCard
  progress: CardProgressView | null
  review: CardReviewView | null
}

// ---------- GET /api/today ----------

/**
 * 今日任务快照响应（PRD 5.3）。
 *
 * `cards` 的顺序即快照落库顺序，当天固定不变；
 * `type === 'review'` 的条目带 `stage` / `lastScore`。
 */
export interface TodayPlanResponse {
  /** 快照归属的本地日期 YYYY-MM-DD */
  dateKey: string
  /** 生成快照时用户的每日条数，便于前端解释「为什么今天只有 N 条」 */
  dailyCount: number
  cards: TodayCard[]
  /**
   * 内容不足告警（PRD 09「内容某领域无卡可推」）。
   * 正常为 null；触发跨领域补齐或内容池见底时给出人话提示，前端原样展示。
   */
  contentWarning: string | null
}

// ---------- GET /api/history ----------

/** 单条练习记录 */
export interface HistoryEntry {
  /** 本地日期 YYYY-MM-DD */
  date: string
  cardId: string
  /** 卡片场景标题 */
  title: string
  /** 综合分；降级（未打分）时为 null，前端如实展示「未打分」，不得伪造 */
  score: number | null
}

/** 学习历史统计（PRD 5.6 学习记录页） */
export interface HistoryStats {
  /** 连续学习天数（口径见 PRD 5.6：今天没学时从昨天往前数） */
  streak: number
  /** 本月学习卡片数（本地日期口径） */
  monthCards: number
  /** 累计学习卡片数 */
  totalCards: number
  /** 本周（周一→周日）每天的完成卡数，长度固定为 7 */
  weekActivity: number[]
  /** 最近练习记录，按时间倒序 */
  recent: HistoryEntry[]
}

/** 音频上传约束（PRD 09 章） */
export const AUDIO_LIMITS = {
  repeat: { minSeconds: 3, maxSeconds: 15 },
  answer: { minSeconds: 30, maxSeconds: 60 },
  /** 单文件大小上限 */
  maxBytes: 10 * 1024 * 1024,
  /** 允许的 MIME 类型 */
  allowedMimeTypes: [
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/x-m4a',
  ],
} as const
