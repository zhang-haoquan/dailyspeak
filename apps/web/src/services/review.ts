import type { ReviewItem } from '../types'

/**
 * 遗忘曲线复习排期（PRD 5.5 章）
 * 阶段：S1=第1天, S2=第2天, S3=第4天, S4=第7天, S5=第15天, S6=第30天
 * 规则：得高分（>= 85）进入下一更长间隔阶段；低于阈值回退到上一阶段重来。
 * 算法为纯函数，可单测。
 */

export const REVIEW_STAGES = [
  { stage: 1, intervalDays: 1, label: '次日回顾' },
  { stage: 2, intervalDays: 2, label: '短时强化' },
  { stage: 3, intervalDays: 4, label: '中期保持' },
  { stage: 4, intervalDays: 7, label: '周度巩固' },
  { stage: 5, intervalDays: 15, label: '半月强化' },
  { stage: 6, intervalDays: 30, label: '长期保持' },
] as const

export const PASS_THRESHOLD = 85

export function stageInfo(stage: number) {
  const info = REVIEW_STAGES.find((s) => s.stage === stage)
  return info ?? REVIEW_STAGES[0]
}

function addDays(base: Date, days: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/** 学习完成后的首次排期：S1（次日） */
export function scheduleFirstReview(cardId: string, userId: string, now = new Date()): ReviewItem {
  return {
    userId,
    cardId,
    stage: 1,
    dueAt: addDays(now, REVIEW_STAGES[0].intervalDays),
    lastScore: 0,
    timesReviewed: 0,
  }
}

/**
 * 复习完成后的重新排期：
 * - score >= PASS_THRESHOLD → 进入下一阶段（封顶 S6）
 * - score <  PASS_THRESHOLD → 回退到上一阶段（最低 S1）
 */
export function scheduleNextReview(
  current: ReviewItem,
  score: number,
  now = new Date(),
): ReviewItem {
  const passed = score >= PASS_THRESHOLD
  let nextStage = current.stage
  if (passed) {
    nextStage = Math.min(REVIEW_STAGES.length, current.stage + 1)
  } else {
    nextStage = Math.max(1, current.stage - 1)
  }
  const interval = stageInfo(nextStage).intervalDays
  return {
    ...current,
    stage: nextStage,
    dueAt: addDays(now, interval),
    lastScore: score,
    timesReviewed: current.timesReviewed + 1,
  }
}

/** 判断是否到期（dueAt <= 今天结束） */
export function isDue(item: ReviewItem, now = new Date()): boolean {
  const due = new Date(item.dueAt).getTime()
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)
  return due <= endOfToday.getTime()
}

/** 格式化日期为 YYYY-MM-DD */
export function formatDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
