/**
 * 遗忘曲线排期单测（PRD 09 章「测试策略」要求）
 * 覆盖：阶段间隔边界、分数回退、封顶、到期判定、跨月与跨年。
 */
import { PASS_THRESHOLD } from '@dailyspeak/shared'
import {
  STAGE_INTERVALS,
  isDue,
  scheduleFirstReview,
  scheduleNextReview,
} from './review.schedule'

/** 构造一个本地时间，避免测试受运行机器时区影响 */
const at = (y: number, m: number, d: number, h = 10, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0)

const key = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

describe('复习阶段定义', () => {
  it('间隔符合 PRD 5.5：1 / 2 / 4 / 7 / 15 / 30 天', () => {
    expect([...STAGE_INTERVALS]).toEqual([1, 2, 4, 7, 15, 30])
  })
})

describe('scheduleFirstReview（新卡学完）', () => {
  it('落在 S1，且到期日是次日 00:00', () => {
    const r = scheduleFirstReview(90, at(2026, 9, 11))
    expect(r.stage).toBe(1)
    expect(r.timesReviewed).toBe(0)
    expect(r.lastScore).toBe(90)
    expect(r.dueAt.getHours()).toBe(0)
    expect(r.dueAt.getMinutes()).toBe(0)
    expect(key(r.dueAt)).toBe('2026-09-12')
  })

  it('跨月正确：9/30 学完 → 10/1', () => {
    const r = scheduleFirstReview(90, at(2026, 9, 30))
    expect(key(r.dueAt)).toBe('2026-10-01')
  })

  it('跨年正确：12/31 学完 → 次年 1/1', () => {
    const r = scheduleFirstReview(90, at(2026, 12, 31))
    expect(key(r.dueAt)).toBe('2027-01-01')
  })

  it('深夜学完仍算当天，次日到期', () => {
    const r = scheduleFirstReview(90, at(2026, 9, 11, 23, 59))
    expect(key(r.dueAt)).toBe('2026-09-12')
  })
})

describe('scheduleNextReview（复习完成）', () => {
  it('达到阈值 → 进入下一阶段，按新间隔排期', () => {
    const r = scheduleNextReview({ stage: 2, timesReviewed: 1 }, PASS_THRESHOLD, at(2026, 9, 11))
    expect(r.stage).toBe(3) // S3 间隔 4 天
    expect(key(r.dueAt)).toBe('2026-09-15')
    expect(r.timesReviewed).toBe(2)
    expect(r.lastScore).toBe(PASS_THRESHOLD)
  })

  it('低于阈值 → 回退一级，按上一阶段间隔排期', () => {
    const r = scheduleNextReview({ stage: 4, timesReviewed: 3 }, PASS_THRESHOLD - 1, at(2026, 9, 11))
    expect(r.stage).toBe(3)
    expect(key(r.dueAt)).toBe('2026-09-15')
    expect(r.timesReviewed).toBe(4)
  })

  it('S6 封顶：不会超过 6', () => {
    const r = scheduleNextReview({ stage: 6, timesReviewed: 9 }, 100, at(2026, 9, 11))
    expect(r.stage).toBe(6)
    expect(key(r.dueAt)).toBe('2026-10-11') // 30 天后
  })

  it('S1 触底：低分不会低于 1', () => {
    const r = scheduleNextReview({ stage: 1, timesReviewed: 0 }, 0, at(2026, 9, 11))
    expect(r.stage).toBe(1)
    expect(key(r.dueAt)).toBe('2026-09-12')
  })

  it('阈值边界：85 算通过，84 算未通过', () => {
    expect(scheduleNextReview({ stage: 3, timesReviewed: 1 }, 85, at(2026, 9, 11)).stage).toBe(4)
    expect(scheduleNextReview({ stage: 3, timesReviewed: 1 }, 84, at(2026, 9, 11)).stage).toBe(2)
  })
})

describe('isDue（到期判定）', () => {
  it('到期日当天算到期（含当天 00:00 与 23:59）', () => {
    const due = at(2026, 9, 11, 0, 0)
    expect(isDue(due, at(2026, 9, 11, 0, 0))).toBe(true)
    expect(isDue(due, at(2026, 9, 11, 23, 59))).toBe(true)
  })

  it('到期日前一天不算到期', () => {
    const due = at(2026, 9, 11, 0, 0)
    expect(isDue(due, at(2026, 9, 10, 23, 59))).toBe(false)
  })

  it('逾期很久仍算到期', () => {
    const due = at(2026, 9, 1, 0, 0)
    expect(isDue(due, at(2026, 9, 11, 12, 0))).toBe(true)
  })
})
