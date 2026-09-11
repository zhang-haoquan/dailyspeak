import { Injectable, Logger } from '@nestjs/common'
import {
  endOfLocalDay,
  formatDateKey,
  isSameLocalDay,
  type TodayCard,
  type TodayPlanResponse,
  type UserProfile,
} from '@dailyspeak/shared'
import type { Prisma } from '../generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ProfileService } from '../profile/profile.service'
import { isDue } from '../review/review.schedule'
import { toScenarioCard } from '../cards/cards.mapper'
import {
  buildTodayPlan,
  describeContentWarning,
  newCardQuota,
  orderFallbackDomains,
  type PlanCardRef,
  type PlannedTask,
} from './today.plan'

/** Prisma 唯一约束冲突 */
function isUniqueViolation(err: unknown): boolean {
  return (
    !!err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  )
}

/** 落库的 `tasks` 是 Json，读回来必须当不可信数据处理 */
function parseStoredTasks(raw: unknown): PlannedTask[] {
  if (!Array.isArray(raw)) return []
  const out: PlannedTask[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const t = item as Record<string, unknown>
    const cardId = typeof t.cardId === 'string' && t.cardId ? t.cardId : null
    const type = t.type === 'review' ? 'review' : t.type === 'new' ? 'new' : null
    if (!cardId || !type) continue
    out.push({
      cardId,
      type,
      domain: typeof t.domain === 'string' ? t.domain : '',
      fromFallback: t.fromFallback === true,
    })
  }
  return out
}

@Injectable()
export class TodayService {
  private readonly logger = new Logger(TodayService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly profileService: ProfileService,
  ) {}

  /**
   * 今日任务（PRD 5.3）。
   *
   * 当天首次进入时生成快照并落库（`today_plan`），之后当天固定不变——
   * 否则「完成一张复习卡 → 该卡不再到期 → 新句名额变多」会让今日条数
   * 在一天之内变化，进度出现 1/3 → 1/4 的跳变（D-004）。
   */
  async getToday(userId: string, now: Date = new Date()): Promise<TodayPlanResponse> {
    const profile = await this.profileService.get(userId)
    const dateKey = formatDateKey(now)

    const stored = await this.prisma.todayPlan.findUnique({
      where: { userId_dateKey: { userId, dateKey } },
    })

    const tasks = stored
      ? parseStoredTasks(stored.tasks)
      : await this.generateAndStore(userId, profile, dateKey, now)

    const quota = newCardQuota(
      profile.dailyCount,
      tasks.filter((t) => t.type === 'review').length,
    )

    return {
      dateKey,
      dailyCount: profile.dailyCount,
      cards: await this.hydrate(userId, tasks, now),
      contentWarning: describeContentWarning(tasks, quota),
    }
  }

  /** 生成快照并落库；并发下以先落库的那份为准 */
  private async generateAndStore(
    userId: string,
    profile: UserProfile,
    dateKey: string,
    now: Date,
  ): Promise<PlannedTask[]> {
    const plan = buildTodayPlan(await this.collectPlanInput(userId, profile, now))

    if (plan.contentWarning) {
      // PRD 09：内容不足要「后台提示内容告警」
      this.logger.warn(`用户 ${userId} 今日内容告警：${plan.contentWarning}`)
    }

    try {
      await this.prisma.todayPlan.create({
        // Json 列要求可索引结构，PlannedTask 是接口，显式转换
        data: { userId, dateKey, tasks: plan.tasks as unknown as Prisma.InputJsonValue },
      })
      return plan.tasks
    } catch (err) {
      // 同一用户并发首次进入，唯一键 (user_id, date_key) 会挡住重复插入
      if (!isUniqueViolation(err)) throw err
      this.logger.log(`用户 ${userId} 的 ${dateKey} 快照已被并发请求生成，读取已有快照`)
      const stored = await this.prisma.todayPlan.findUnique({
        where: { userId_dateKey: { userId, dateKey } },
      })
      return stored ? parseStoredTasks(stored.tasks) : plan.tasks
    }
  }

  /** 组装排卡算法的输入（所有口径都在 today.plan.ts 里，这里只负责取数） */
  private async collectPlanInput(userId: string, profile: UserProfile, now: Date) {
    const [dueRows, progressRows, poolRows] = await Promise.all([
      // SQL 侧先用 (user_id, due_at) 索引粗筛，精确判定仍走 isDue，保证与排期算法同源
      this.prisma.reviewSchedule.findMany({
        where: { userId, dueAt: { lte: endOfLocalDay(now) } },
        orderBy: { dueAt: 'asc' },
        include: { card: { select: { id: true, domain: true, status: true } } },
      }),
      this.prisma.userProgress.findMany({
        where: { userId },
        select: { cardId: true, repeatScore: true, answerScore: true, doneAt: true },
        orderBy: { doneAt: 'asc' },
      }),
      this.prisma.scenarioCard.findMany({
        where: { status: 'published' },
        select: { id: true, domain: true },
      }),
    ])

    const poolByDomain: Record<string, string[]> = {}
    const domainByCard = new Map<string, string>()
    for (const c of poolRows) {
      ;(poolByDomain[c.domain] ??= []).push(c.id)
      domainByCard.set(c.id, c.domain)
    }

    const dueReviews: PlanCardRef[] = dueRows
      .filter((r) => r.card.status === 'published' && isDue(r.dueAt, now))
      .map((r) => ({ cardId: r.cardId, domain: r.card.domain }))

    const masteredCardIds = progressRows
      .filter((p) => p.answerScore !== null)
      .map((p) => p.cardId)

    // 「只完成跟读、未完成应答」的卡：补回今日列表，否则它既不在今日卡里
    // 也没有复习排期，会永久消失
    const inProgress: PlanCardRef[] = []
    for (const p of progressRows) {
      if (p.repeatScore === null || p.answerScore !== null) continue
      const domain = domainByCard.get(p.cardId)
      if (!domain) continue // 内容已下架，推不出来就不推
      inProgress.push({ cardId: p.cardId, domain })
    }

    return {
      dailyCount: profile.dailyCount,
      selectedDomains: profile.domains,
      dueReviews,
      inProgress,
      masteredCardIds,
      poolByDomain,
      fallbackDomains: orderFallbackDomains(Object.keys(poolByDomain)),
    }
  }

  /** 把快照里的 task 补成前端要渲染的 TodayCard */
  private async hydrate(
    userId: string,
    tasks: readonly PlannedTask[],
    now: Date,
  ): Promise<TodayCard[]> {
    if (tasks.length === 0) return []
    const cardIds = tasks.map((t) => t.cardId)

    const [cardRows, progressRows, reviewRows] = await Promise.all([
      this.prisma.scenarioCard.findMany({
        where: { id: { in: cardIds }, status: 'published' },
      }),
      this.prisma.userProgress.findMany({ where: { userId, cardId: { in: cardIds } } }),
      this.prisma.reviewSchedule.findMany({ where: { userId, cardId: { in: cardIds } } }),
    ])

    const cardById = new Map(cardRows.map((c) => [c.id, c]))
    const progressByCard = new Map(progressRows.map((p) => [p.cardId, p]))
    const reviewByCard = new Map(reviewRows.map((r) => [r.cardId, r]))

    const out: TodayCard[] = []
    for (const task of tasks) {
      const row = cardById.get(task.cardId)
      // 快照生成后内容被下架：安静跳过，不让整页 500
      if (!row) continue

      // 步骤标记只看今天这一轮练习的提交，
      // 否则复习卡一进页面就显示「跟读 ✓ 应答 ✓」
      const progress = progressByCard.get(task.cardId)
      const todayProgress =
        progress && isSameLocalDay(progress.doneAt, now) ? progress : undefined

      const base: TodayCard = {
        card: toScenarioCard(row),
        type: task.type,
        repeatDone: todayProgress?.repeatScore != null,
        answerDone: todayProgress?.answerScore != null,
      }

      if (task.type === 'review') {
        const review = reviewByCard.get(task.cardId)
        base.stage = review?.stage ?? 1
        base.lastScore = review?.lastScore
      }

      out.push(base)
    }
    return out
  }
}
