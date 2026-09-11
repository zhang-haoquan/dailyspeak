/**
 * 接口契约（前后端共用）
 *
 * 统一响应与错误格式，见 docs/DECISIONS.md 的技术选型：
 *   API 前缀 /api，错误格式 { code, message, details? }
 */

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

/** 学习历史统计（P5 历史页） */
export interface HistoryStats {
  /** 连续学习天数 */
  streak: number
  /** 本月学习卡片数 */
  monthCards: number
  /** 累计学习卡片数 */
  totalCards: number
  /** 本周（周一→周日）每天的完成卡数，长度固定为 7 */
  weekActivity: number[]
  /** 最近练习记录 */
  recent: {
    date: string
    title: string
    /** 综合分；未打分（降级）时为 null */
    score: number | null
  }[]
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
