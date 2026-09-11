/**
 * 遗忘曲线复习排期（PRD 5.5）
 *
 * 阶段定义与阈值放在 shared，保证前后端口径一致：
 * 后端用它做排期计算，前端用它渲染「短时强化 · 第 2 次」这类文案。
 */

import type { ScenarioCard } from './domain'

export interface ReviewStage {
  /** 阶段序号 1–6 */
  stage: number
  /** 距上次复习的天数 */
  intervalDays: number
  /** 含义文案 */
  label: string
}

export const REVIEW_STAGES: readonly ReviewStage[] = [
  { stage: 1, intervalDays: 1, label: '次日回顾' },
  { stage: 2, intervalDays: 2, label: '短时强化' },
  { stage: 3, intervalDays: 4, label: '中期保持' },
  { stage: 4, intervalDays: 7, label: '周度巩固' },
  { stage: 5, intervalDays: 15, label: '半月强化' },
  { stage: 6, intervalDays: 30, label: '长期保持' },
] as const

export const MAX_STAGE = REVIEW_STAGES.length

/** 复习得高分（≥ 该值）进入下一更长间隔阶段，否则回退一级 */
export const PASS_THRESHOLD = 85

export function stageInfo(stage: number): ReviewStage {
  return REVIEW_STAGES.find((s) => s.stage === stage) ?? REVIEW_STAGES[0]
}

/** 复习排期记录 */
export interface ReviewItem {
  userId: string
  cardId: string
  /** 当前阶段 1–6 */
  stage: number
  /** 下次复习时间（ISO） */
  dueAt: string
  /** 上次得分 */
  lastScore: number
  /** 已复习次数 */
  timesReviewed: number
}

/** 学习进度（每张卡的跟读/应答/综合分） */
export interface CardProgress {
  userId: string
  cardId: string
  repeatScore: number | null
  answerScore: number | null
  composite: number | null
  doneAt: string
  mode: LearningMode
}

/** 本次练习是新卡还是复习卡 */
export type LearningMode = 'new' | 'review'

/** 今日任务卡（学习台展示用） */
export interface TodayCard {
  card: ScenarioCard
  type: LearningMode
  /** 复习卡的当前阶段 */
  stage?: number
  /** 复习卡的上次得分 */
  lastScore?: number
  /** 今天是否已完成跟读 */
  repeatDone: boolean
  /** 今天是否已完成应答 */
  answerDone: boolean
}
