/**
 * 历史统计口径（PRD 5.6）—— 纯函数，可单测
 *
 * 全部按**本地日期**计算，不用 UTC 字符串前缀比较
 * （这个坑在 Phase 0 的历史页踩过一次：东八区凌晨会算到前一天）。
 */
import { addLocalDays, formatDateKey, startOfLocalWeek } from '@dailyspeak/shared'

/**
 * 连续学习天数（D-028）。
 *
 * 口径：从「今天」往前连续计数；**若今天还没学，则从昨天往前数**。
 * 理由：用户早上打开应用时，今天尚未学习，若直接从今天数会显示「连续 0 天」，
 * 把昨天为止的真实连续记录抹掉，是很常见的体验事故。
 * 今天和昨天都没有记录 → 0。
 */
export function computeStreak(doneDateKeys: readonly string[], now: Date): number {
  const days = new Set(doneDateKeys)

  let cursor: Date
  if (days.has(formatDateKey(now))) {
    cursor = now
  } else {
    const yesterday = addLocalDays(now, -1)
    if (!days.has(formatDateKey(yesterday))) return 0
    cursor = yesterday
  }

  let streak = 0
  while (days.has(formatDateKey(cursor))) {
    streak++
    cursor = addLocalDays(cursor, -1)
  }
  return streak
}

/**
 * 本周（周一 → 周日）每天的完成卡数，长度固定 7。
 * 调用方传进来的应当是本周范围内的记录，越界记录会被忽略。
 */
export function bucketByWeek(doneAts: readonly Date[], now: Date): number[] {
  const weekStart = startOfLocalWeek(now)
  const indexByKey = new Map<string, number>()
  for (let i = 0; i < 7; i++) {
    indexByKey.set(formatDateKey(addLocalDays(weekStart, i)), i)
  }

  const buckets = new Array<number>(7).fill(0)
  for (const doneAt of doneAts) {
    const idx = indexByKey.get(formatDateKey(doneAt))
    if (idx !== undefined) buckets[idx]++
  }
  return buckets
}
