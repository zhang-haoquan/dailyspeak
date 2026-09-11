/**
 * 历史统计单测（PRD 5.6 / D-028）
 *
 * 覆盖：连续天数口径（含「今天还没学不归零」）、断档、跨月跨年、
 * 同一天多张卡只算一天、周趋势按本地日期分桶。
 */
import { addLocalDays, formatDateKey, startOfLocalWeek } from '@dailyspeak/shared'
import { bucketByWeek, computeStreak } from './history.stats'

/** 构造本地时间，避免测试受运行机器时区影响 */
const at = (y: number, m: number, d: number, h = 10, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0)

/** 生成从 `end` 往前连续 n 天的日期键（含 end） */
function consecutiveKeys(end: Date, n: number): string[] {
  const keys: string[] = []
  for (let i = 0; i < n; i++) keys.push(formatDateKey(addLocalDays(end, -i)))
  return keys
}

describe('computeStreak（D-028）', () => {
  const today = at(2026, 9, 11)

  it('今天学过：从今天往前数', () => {
    expect(computeStreak(consecutiveKeys(today, 6), today)).toBe(6)
  })

  it('今天还没学、昨天学过：从昨天往前数，不归零', () => {
    const keys = consecutiveKeys(addLocalDays(today, -1), 5)
    expect(computeStreak(keys, today)).toBe(5)
  })

  it('今天和昨天都没学：连续天数归零', () => {
    const keys = consecutiveKeys(addLocalDays(today, -2), 10)
    expect(computeStreak(keys, today)).toBe(0)
  })

  it('中间断档：只数到断点', () => {
    const keys = [
      ...consecutiveKeys(today, 3), // 今天、昨天、前天
      ...consecutiveKeys(addLocalDays(today, -4), 5), // 大前天缺一天
    ]
    expect(computeStreak(keys, today)).toBe(3)
  })

  it('同一天学多张卡只算一天（入参可含重复日期）', () => {
    const k = formatDateKey(today)
    expect(computeStreak([k, k, k], today)).toBe(1)
  })

  it('无记录时为 0', () => {
    expect(computeStreak([], today)).toBe(0)
  })

  it('跨月连续：9/30 → 10/1 不断档', () => {
    const oct1 = at(2026, 10, 1)
    expect(computeStreak([formatDateKey(oct1), '2026-09-30', '2026-09-29'], oct1)).toBe(3)
  })

  it('跨年连续：12/31 → 次年 1/1 不断档', () => {
    const jan1 = at(2027, 1, 1)
    expect(computeStreak([formatDateKey(jan1), '2026-12-31', '2026-12-30'], jan1)).toBe(3)
  })

  it('闰年 2/29 参与连续计数', () => {
    const feb29 = at(2028, 2, 29)
    expect(computeStreak(['2028-02-29', '2028-02-28', '2028-02-27'], feb29)).toBe(3)
  })
})

describe('bucketByWeek（PRD 5.6 本周趋势）', () => {
  // 2026-09-11 是周五
  const friday = at(2026, 9, 11)

  it('固定返回 7 个桶，周一为下标 0', () => {
    expect(bucketByWeek([], friday)).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('本周内记录按周一→周日落桶', () => {
    const buckets = bucketByWeek(
      [
        at(2026, 9, 7, 9), // 周一
        at(2026, 9, 7, 21), // 周一
        at(2026, 9, 11, 8), // 周五
        at(2026, 9, 13, 23), // 周日
      ],
      friday,
    )
    expect(buckets).toEqual([2, 0, 0, 0, 1, 0, 1])
  })

  it('本周之外的记录被忽略（上周日 / 下周一）', () => {
    const buckets = bucketByWeek([at(2026, 9, 6), at(2026, 9, 14)], friday)
    expect(buckets).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('跨月周（9/30 周三所在周）也能正确落桶', () => {
    const wed = at(2026, 9, 30)
    expect(formatDateKey(startOfLocalWeek(wed))).toBe('2026-09-28')
    const buckets = bucketByWeek([at(2026, 9, 28), at(2026, 10, 4)], wed)
    expect(buckets).toEqual([1, 0, 0, 0, 0, 0, 1])
  })
})
