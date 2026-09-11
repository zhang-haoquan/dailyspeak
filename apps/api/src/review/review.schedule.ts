/**
 * 遗忘曲线排期算法（PRD 5.5）
 *
 * 纯函数、无副作用、可单测。服务端在「整卡完成」时调用一次
 * （见 docs/DECISIONS.md D-006：一次复习只推进一级，跟读阶段不改排期）。
 */
import {
  MAX_STAGE,
  PASS_THRESHOLD,
  REVIEW_STAGES,
  addLocalDays,
  startOfLocalDay,
  stageInfo,
} from '@dailyspeak/shared'

/** 排期结果（与 Prisma 的 ReviewSchedule 字段对齐，但不含数据库主键） */
export interface ScheduleResult {
  stage: number
  dueAt: Date
  lastScore: number
  timesReviewed: number
}

/** 学习完成后的首次排期：S1（次日） */
export function scheduleFirstReview(score: number, now: Date = new Date()): ScheduleResult {
  const stage = 1
  return {
    stage,
    dueAt: addLocalDays(now, stageInfo(stage).intervalDays),
    lastScore: score,
    timesReviewed: 0,
  }
}

/**
 * 复习完成后的重新排期：
 * - score >= PASS_THRESHOLD → 进入下一更长间隔阶段（封顶 S6）
 * - score <  PASS_THRESHOLD → 回退到上一阶段（最低 S1）
 */
export function scheduleNextReview(
  current: { stage: number; timesReviewed: number },
  score: number,
  now: Date = new Date(),
): ScheduleResult {
  const passed = score >= PASS_THRESHOLD
  const nextStage = passed
    ? Math.min(MAX_STAGE, current.stage + 1)
    : Math.max(1, current.stage - 1)

  return {
    stage: nextStage,
    dueAt: addLocalDays(now, stageInfo(nextStage).intervalDays),
    lastScore: score,
    timesReviewed: current.timesReviewed + 1,
  }
}

/**
 * 是否到期：到期日 <= 今天（按本地日期比较）。
 * 排期时间点落在目标日的 00:00，所以「今天到期」= 今天 00:00 <= 今天 00:00。
 */
export function isDue(dueAt: Date, now: Date = new Date()): boolean {
  return startOfLocalDay(dueAt).getTime() <= startOfLocalDay(now).getTime()
}

/** 阶段间隔天数（供文档/调试查看） */
export const STAGE_INTERVALS: readonly number[] = REVIEW_STAGES.map((s) => s.intervalDays)
