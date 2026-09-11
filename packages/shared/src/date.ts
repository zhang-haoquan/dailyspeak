/**
 * 本地日期工具（前后端共用）
 *
 * 「今天」的判断必须统一走本地日期，不能用 UTC 字符串前缀比较——
 * 否则在东八区凌晨、月初月末会算错（这个坑在 Phase 0 的历史统计里踩过一次）。
 */

/** 本地日期字符串 YYYY-MM-DD */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 取本地当天 00:00:00.000 */
export function startOfLocalDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** 在本地日历上加减天数（跨月/跨年/夏令时由 Date 自身处理） */
export function addLocalDays(date: Date, days: number): Date {
  const d = startOfLocalDay(date)
  d.setDate(d.getDate() + days)
  return d
}

/** 是否同一天（本地） */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return startOfLocalDay(a).getTime() === startOfLocalDay(b).getTime()
}

/** 取本地当天 23:59:59.999，用于「截止到今天」的区间上界 */
export function endOfLocalDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

/** 取所在自然周的周一 00:00（历史页周趋势图固定「一…日」） */
export function startOfLocalWeek(date: Date): Date {
  const d = startOfLocalDay(date)
  // getDay(): 周日=0，这里换算成周一=0
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return d
}

/** 取所在自然月 1 日 00:00 */
export function startOfLocalMonth(date: Date): Date {
  const d = startOfLocalDay(date)
  d.setDate(1)
  return d
}

/** 取下个自然月 1 日 00:00（做「本月」区间上界，避免月底 +1 天算错） */
export function startOfNextLocalMonth(date: Date): Date {
  const d = startOfLocalMonth(date)
  d.setMonth(d.getMonth() + 1)
  return d
}

/** 本地月份键 YYYY-MM */
export function formatMonthKey(date: Date): string {
  return formatDateKey(date).slice(0, 7)
}
