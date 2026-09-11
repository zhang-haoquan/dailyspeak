/**
 * 今日任务排卡单测（PRD 5.3 / 5.5 / 09 章）
 *
 * 覆盖：新句名额、复习不截断、跟读未完成的卡补回、与复习卡去重、
 * 已掌握不再推、跨领域补齐与告警文案、随机可复现。
 */
import {
  buildTodayPlan,
  describeContentWarning,
  newCardQuota,
  orderFallbackDomains,
  type TodayPlanInput,
} from './today.plan'

/** 固定随机源：始终取第 0 个，使洗牌结果可预测 */
const noShuffle = () => 0

function input(overrides: Partial<TodayPlanInput> = {}): TodayPlanInput {
  return {
    dailyCount: 3,
    selectedDomains: ['计算机/IT'],
    dueReviews: [],
    inProgress: [],
    masteredCardIds: [],
    poolByDomain: { '计算机/IT': ['c01', 'c02', 'c03', 'c04'] },
    fallbackDomains: ['计算机/IT'],
    random: noShuffle,
    ...overrides,
  }
}

describe('newCardQuota（PRD 5.3）', () => {
  it('新句名额 = 每日条数 − 到期复习卡数', () => {
    expect(newCardQuota(3, 1)).toBe(2)
    expect(newCardQuota(5, 5)).toBe(0)
  })

  it('复习卡多于每日条数时名额为 0，不出现负数', () => {
    expect(newCardQuota(3, 7)).toBe(0)
  })
})

describe('buildTodayPlan —— 基本排卡', () => {
  it('复习卡全部保留，新句补足到名额', () => {
    const r = buildTodayPlan(
      input({
        dailyCount: 3,
        dueReviews: [{ cardId: 'c09', domain: '职场通用' }],
        masteredCardIds: ['c09'],
      }),
    )
    expect(r.tasks.filter((t) => t.type === 'review')).toHaveLength(1)
    expect(r.tasks.filter((t) => t.type === 'new')).toHaveLength(2)
  })

  it('到期复习卡不得同时出现在新句里（去重）', () => {
    const r = buildTodayPlan(
      input({
        dailyCount: 3,
        dueReviews: [{ cardId: 'c01', domain: '计算机/IT' }],
      }),
    )
    expect(r.tasks.filter((t) => t.cardId === 'c01')).toHaveLength(1)
    expect(r.tasks.find((t) => t.cardId === 'c01')?.type).toBe('review')
  })

  it('已掌握（应答已完成）的卡不再作为新句推送', () => {
    const r = buildTodayPlan(
      input({
        dailyCount: 4,
        masteredCardIds: ['c01', 'c02'],
        poolByDomain: { '计算机/IT': ['c01', 'c02', 'c03', 'c04'] },
      }),
    )
    const newIds = r.tasks.filter((t) => t.type === 'new').map((t) => t.cardId)
    expect(newIds).not.toContain('c01')
    expect(newIds).not.toContain('c02')
    expect(newIds).toEqual(['c03', 'c04'])
  })

  it('复习卡多于每日条数时不截断复习，新句名额为 0（PRD 5.5）', () => {
    const due = ['c01', 'c02', 'c03', 'c04'].map((cardId) => ({ cardId, domain: '计算机/IT' }))
    const r = buildTodayPlan(input({ dailyCount: 2, dueReviews: due }))
    expect(r.tasks).toHaveLength(4)
    expect(r.tasks.every((t) => t.type === 'review')).toBe(true)
  })

  it('同一张卡在一个快照里不重复出现', () => {
    const r = buildTodayPlan(
      input({
        dailyCount: 4,
        poolByDomain: { '计算机/IT': ['c01', 'c01', 'c02'] },
      }),
    )
    expect(new Set(r.tasks.map((t) => t.cardId)).size).toBe(r.tasks.length)
  })
})

describe('buildTodayPlan —— 只完成跟读的卡必须补回（旧 bug 回归）', () => {
  it('跟读已完成、应答未完成的卡进入今日新句', () => {
    const r = buildTodayPlan(
      input({
        dailyCount: 2,
        inProgress: [{ cardId: 'c03', domain: '计算机/IT' }],
        poolByDomain: { '计算机/IT': ['c01', 'c02', 'c03', 'c04'] },
      }),
    )
    const newIds = r.tasks.filter((t) => t.type === 'new').map((t) => t.cardId)
    expect(newIds).toContain('c03')
    // 优先补回：排在新卡之前
    expect(newIds[0]).toBe('c03')
  })

  it('补回的卡也占用新句名额', () => {
    const r = buildTodayPlan(
      input({
        dailyCount: 1,
        inProgress: [{ cardId: 'c03', domain: '计算机/IT' }],
      }),
    )
    expect(r.tasks).toHaveLength(1)
    expect(r.tasks[0].cardId).toBe('c03')
  })

  it('补回的卡若同时到期，只按复习卡出现一次', () => {
    const r = buildTodayPlan(
      input({
        dailyCount: 3,
        dueReviews: [{ cardId: 'c03', domain: '计算机/IT' }],
        inProgress: [{ cardId: 'c03', domain: '计算机/IT' }],
      }),
    )
    expect(r.tasks.filter((t) => t.cardId === 'c03')).toHaveLength(1)
    expect(r.tasks.find((t) => t.cardId === 'c03')?.type).toBe('review')
  })

  it('内容池为空时不产生任何卡片，也不抛错', () => {
    const r = buildTodayPlan(
      input({
        dailyCount: 1,
        poolByDomain: { '计算机/IT': [] },
        fallbackDomains: [],
      }),
    )
    expect(r.tasks).toHaveLength(0)
    expect(r.contentWarning).toContain('0/1')
  })
})

describe('buildTodayPlan —— 跨领域补齐（PRD 09）', () => {
  it('已选领域没内容时从其他领域补齐', () => {
    const r = buildTodayPlan(
      input({
        dailyCount: 2,
        selectedDomains: ['金融'],
        poolByDomain: { '职场通用': ['c05', 'c06'] },
        fallbackDomains: ['计算机/IT', '职场通用'],
      }),
    )
    expect(r.tasks).toHaveLength(2)
    expect(r.tasks.every((t) => t.fromFallback)).toBe(true)
    expect(r.contentWarning).toContain('其他领域')
  })

  it('已选领域内容不足时，先用自己的再用其他领域', () => {
    const r = buildTodayPlan(
      input({
        dailyCount: 3,
        selectedDomains: ['计算机/IT'],
        poolByDomain: { '计算机/IT': ['c01'], '职场通用': ['c05', 'c06'] },
        fallbackDomains: ['计算机/IT', '职场通用'],
      }),
    )
    expect(r.tasks).toHaveLength(3)
    expect(r.tasks.filter((t) => !t.fromFallback)).toHaveLength(1)
    expect(r.tasks.filter((t) => t.fromFallback)).toHaveLength(2)
  })

  it('内容池整体见底时如实告知实际条数', () => {
    const r = buildTodayPlan(
      input({
        dailyCount: 5,
        poolByDomain: { '计算机/IT': ['c01'] },
      }),
    )
    expect(r.tasks).toHaveLength(1)
    expect(r.contentWarning).toContain('1/5')
  })

  it('内容足够时不产生告警', () => {
    const r = buildTodayPlan(input({ dailyCount: 2 }))
    expect(r.contentWarning).toBeNull()
  })

  it('名额为 0（复习占满）时不算内容不足', () => {
    const due = ['c01', 'c02', 'c03'].map((cardId) => ({ cardId, domain: '计算机/IT' }))
    const r = buildTodayPlan(input({ dailyCount: 3, dueReviews: due }))
    expect(r.contentWarning).toBeNull()
  })

  it('还没选领域时不对领域设限，也不误报「已学完」', () => {
    const r = buildTodayPlan(
      input({
        dailyCount: 2,
        selectedDomains: [],
        poolByDomain: { '计算机/IT': ['c01'], '职场通用': ['c05'] },
        fallbackDomains: ['计算机/IT', '职场通用'],
      }),
    )
    expect(r.tasks).toHaveLength(2)
    expect(r.tasks.every((t) => !t.fromFallback)).toBe(true)
    expect(r.contentWarning).toBeNull()
  })
})

describe('describeContentWarning —— 从快照复现告警', () => {
  it('与生成时结论一致（告警不落库，读回时重算）', () => {
    const tasks = [
      { cardId: 'c05', type: 'new' as const, domain: '职场通用', fromFallback: true },
    ]
    expect(describeContentWarning(tasks, 1)).toContain('其他领域')
    expect(describeContentWarning(tasks, 2)).toContain('1/2')
  })

  it('没有新句名额也没有新句时不告警', () => {
    const reviews = [
      { cardId: 'c01', type: 'review' as const, domain: '计算机/IT', fromFallback: false },
    ]
    expect(describeContentWarning(reviews, 0)).toBeNull()
    expect(describeContentWarning([], 0)).toBeNull()
  })
})

describe('orderFallbackDomains（PRD 09 跨领域补齐顺序）', () => {
  it('首发领域优先，其余按字典序，结果与输入顺序无关', () => {
    expect(orderFallbackDomains(['金融', '职场通用', '汽车制造', '计算机/IT'])).toEqual([
      '计算机/IT',
      '职场通用',
      '汽车制造',
      '金融',
    ])
  })

  it('没有内容的领域不会出现在候选里', () => {
    expect(orderFallbackDomains(['职场通用'])).toEqual(['职场通用'])
  })

  it('内容池为空时返回空数组', () => {
    expect(orderFallbackDomains([])).toEqual([])
  })
})

describe('洗牌可复现（注入随机源）', () => {
  it('相同随机序列得到相同顺序', () => {
    const pool = { '计算机/IT': ['c01', 'c02', 'c03', 'c04', 'c05'] }
    const a = buildTodayPlan(input({ dailyCount: 5, poolByDomain: pool }))
    const b = buildTodayPlan(input({ dailyCount: 5, poolByDomain: pool }))
    expect(a.tasks.map((t) => t.cardId)).toEqual(b.tasks.map((t) => t.cardId))
  })

  it('不同随机序列会给出不同顺序，说明确实在随机调度', () => {
    const pool = { '计算机/IT': ['c01', 'c02', 'c03', 'c04', 'c05'] }
    const a = buildTodayPlan(
      input({ dailyCount: 1, poolByDomain: pool, random: () => 0 }),
    )
    const b = buildTodayPlan(
      input({ dailyCount: 1, poolByDomain: pool, random: () => 0.99 }),
    )
    expect(a.tasks[0].cardId).not.toBe(b.tasks[0].cardId)
  })
})
