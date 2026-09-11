import { Injectable } from '@nestjs/common'
import {
  addLocalDays,
  formatDateKey,
  startOfLocalMonth,
  startOfLocalWeek,
  startOfNextLocalMonth,
  type HistoryEntry,
  type HistoryStats,
} from '@dailyspeak/shared'
import { PrismaService } from '../prisma/prisma.service'
import { bucketByWeek, computeStreak } from './history.stats'

/** 最近练习展示条数 */
const RECENT_LIMIT = 8

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 学习记录统计（PRD 5.6）。
   *
   * 说明：连续天数需要用户「有提交的全部日期」，这里直接取回 `done_at` 单列后在
   * 应用层按本地日期归并——因为「本地日期」取决于运行时区，SQL 里 `date_trunc`
   * 会按数据库时区算，两者不一致时会算错。MVP 单用户量级（百行内）完全够用；
   * 量级上来后改为按用户写入 `study_days` 汇总表，见 D-029。
   */
  async getStats(userId: string, now: Date = new Date()): Promise<HistoryStats> {
    const weekStart = startOfLocalWeek(now)
    const weekEnd = addLocalDays(weekStart, 7)

    const [allDoneRows, monthCards, weekRows, recentRows] = await Promise.all([
      this.prisma.userProgress.findMany({
        where: { userId },
        select: { doneAt: true },
      }),
      this.prisma.userProgress.count({
        where: {
          userId,
          doneAt: { gte: startOfLocalMonth(now), lt: startOfNextLocalMonth(now) },
        },
      }),
      this.prisma.userProgress.findMany({
        where: { userId, doneAt: { gte: weekStart, lt: weekEnd } },
        select: { doneAt: true },
      }),
      this.prisma.userProgress.findMany({
        where: { userId },
        orderBy: { doneAt: 'desc' },
        take: RECENT_LIMIT,
        include: { card: { select: { id: true, sceneText: true } } },
      }),
    ])

    const recent: HistoryEntry[] = recentRows.map((row) => ({
      date: formatDateKey(row.doneAt),
      cardId: row.cardId,
      title: row.card.sceneText,
      // 只认综合分：只做了跟读、或第三方失败降级的记录一律为 null，
      // 前端显示「未打分」。绝不用跟读分或 0 分顶替（PRD 09 / D-010）。
      score: row.composite,
    }))

    return {
      streak: computeStreak(
        allDoneRows.map((r) => formatDateKey(r.doneAt)),
        now,
      ),
      monthCards,
      totalCards: allDoneRows.length,
      weekActivity: bucketByWeek(
        weekRows.map((r) => r.doneAt),
        now,
      ),
      recent,
    }
  }
}
