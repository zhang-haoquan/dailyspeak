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
