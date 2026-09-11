/**
 * 今日任务排卡算法（PRD 5.3）—— 纯函数，无数据库依赖，可单测
 *
 * 口径（全部来自 PRD，改动前先改 PRD）：
 * 1. 新句名额 = max(0, 每日条数 − 今日到期复习卡数)。
 * 2. 到期复习卡**不截断**：宁可超出每日条数，也不能漏复习，
 *    否则遗忘曲线会因「攒着不做」而失真（PRD 5.5）。
 * 3. 只完成跟读、未完成应答的卡优先补回今日列表——
 *    否则用户中途离开后，这张卡既不在今日列表也没有复习排期，会永远消失。
 * 4. 已到期的复习卡不得再出现在「新句」里（去重）。
 * 5. 已掌握（应答已完成）的卡不再作为新句推送。
 * 6. 新句随机调度且去重；随机用 Fisher-Yates 无偏洗牌
 *    （旧实现用 `sort(() => Math.random() - 0.5)`，分布是偏的）。
 * 7. 已选领域内容不够时，按 PRD 09 从其他有内容的领域补齐，并给出告警文案。
 */
import { AVAILABLE_DOMAINS, type LearningMode } from '@dailyspeak/shared'

/** 排卡只需要卡片的 id 与领域，不需要整张卡 */
export interface PlanCardRef {
  cardId: string
  domain: string
}

export interface TodayPlanInput {
  /** 每日条数（含复习），1–10 */
  dailyCount: number
  /** 用户已选领域 */
  selectedDomains: readonly string[]
  /** 今日到期复习卡，按 dueAt 升序 */
  dueReviews: readonly PlanCardRef[]
  /** 只完成跟读、未完成应答的卡，按 doneAt 升序 */
  inProgress: readonly PlanCardRef[]
  /** 已掌握（应答已完成）的卡 id */
  masteredCardIds: readonly string[]
  /** 已上线内容池：领域 → 卡 id 列表 */
  poolByDomain: Readonly<Record<string, readonly string[]>>
  /**
   * 跨领域补齐的候选领域（**不含**已选领域），按优先级排序。
   * 由调用方按「首发领域优先、其余按字典序」给定，保证结果可复现。
   */
  fallbackDomains: readonly string[]
  /** 随机源，测试注入固定序列即可得到确定结果 */
  random?: () => number
}

export interface PlannedTask {
  cardId: string
  type: LearningMode
  /** 该卡所属领域 */
  domain: string
  /** 是否来自跨领域补齐（PRD 09） */
  fromFallback: boolean
}

export interface TodayPlanResult {
  tasks: PlannedTask[]
  /** 内容不足告警，正常为 null */
  contentWarning: string | null
}

/** 无偏洗牌（Fisher-Yates） */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const arr = items.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

/**
 * 依据快照内容生成告警文案。
 * 快照读取时也调用它——`contentWarning` 不落库，从 tasks 复现，避免两份真相。
 */
export function describeContentWarning(
  tasks: readonly PlannedTask[],
  newQuota: number,
): string | null {
  const newCount = tasks.filter((t) => t.type === 'new').length
  const usedFallback = tasks.some((t) => t.fromFallback)

  if (newCount < newQuota) {
    return `内容库储备不足：今日新句 ${newCount}/${newQuota} 条，我们正在补充更多场景卡`
  }
  if (usedFallback) {
    return '已选领域的卡片都已学过，今日新句从其他领域补充'
  }
  return null
}

/** 新句名额 = 每日条数 − 到期复习卡数（不为负） */
export function newCardQuota(dailyCount: number, dueReviewCount: number): number {
  return Math.max(0, dailyCount - dueReviewCount)
}

/**
 * 跨领域补齐的候选领域顺序（PRD 09）。
 * 首发领域优先，其余按字典序——同一份内容池下结果可复现，
 * 不依赖数据库返回行的顺序。
 */
export function orderFallbackDomains(domainsWithContent: readonly string[]): string[] {
  const present = new Set<string>(domainsWithContent)
  const head: string[] = AVAILABLE_DOMAINS.filter((d) => present.has(d))
  const tail = domainsWithContent.filter((d) => !head.includes(d)).sort()
  return [...head, ...tail]
}

export function buildTodayPlan(input: TodayPlanInput): TodayPlanResult {
  const random = input.random ?? Math.random

  // 尚未完成首次引导（没选领域）时，不对领域设限：所有已上线内容都可推，
  // 且不算「跨领域补齐」——否则会给用户推一条莫名其妙的「已选领域已学完」告警。
  const effectiveSelected =
    input.selectedDomains.length > 0 ? input.selectedDomains : input.fallbackDomains

  // 到期复习卡全部保留，不去重也不截断
  const reviewTasks: PlannedTask[] = input.dueReviews.map((r) => ({
    cardId: r.cardId,
    type: 'review' as const,
    domain: r.domain,
    fromFallback: false,
  }))

  const quota = newCardQuota(input.dailyCount, reviewTasks.length)

  const blocked = new Set<string>(input.masteredCardIds)
  for (const r of input.dueReviews) blocked.add(r.cardId)

  const picked = new Set<string>()
  const newTasks: PlannedTask[] = []

  const take = (ref: PlanCardRef, fromFallback: boolean): void => {
    if (newTasks.length >= quota) return
    if (picked.has(ref.cardId) || blocked.has(ref.cardId)) return
    picked.add(ref.cardId)
    newTasks.push({
      cardId: ref.cardId,
      type: 'new',
      domain: ref.domain,
      fromFallback,
    })
  }

  // 1) 先补回「只完成跟读」的卡
  for (const ref of input.inProgress) take(ref, false)

  // 2) 再用已选领域里没学过的卡补足
  const selectedPool: PlanCardRef[] = []
  for (const domain of effectiveSelected) {
    for (const cardId of input.poolByDomain[domain] ?? []) {
      selectedPool.push({ cardId, domain })
    }
  }
  for (const ref of shuffle(selectedPool, random)) take(ref, false)

  // 3) 仍不够 → 跨领域补齐（PRD 09「内容某领域无卡可推」）
  if (newTasks.length < quota) {
    for (const domain of input.fallbackDomains) {
      if (effectiveSelected.includes(domain)) continue
      const pool = (input.poolByDomain[domain] ?? []).map((cardId) => ({ cardId, domain }))
      for (const ref of shuffle(pool, random)) take(ref, true)
      if (newTasks.length >= quota) break
    }
  }

  const tasks = [...newTasks, ...reviewTasks]
  return { tasks, contentWarning: describeContentWarning(tasks, quota) }
}
