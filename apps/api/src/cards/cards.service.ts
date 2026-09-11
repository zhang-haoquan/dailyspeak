import { Injectable } from '@nestjs/common'
import type { CardDetail } from '@dailyspeak/shared'
import { notFound } from '../common/api-errors'
import { PrismaService } from '../prisma/prisma.service'
import { toScenarioCard } from './cards.mapper'

@Injectable()
export class CardsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 卡片详情：内容 + 我的进度 + 我的复习阶段（PRD 07 章接口契约）。
   *
   * 一次返回三块，是因为学习页、结果页都要同时用到它们——
   * 拆成三个接口只会让前端多两次串行往返，且中间的 loading 态很难看。
   */
  async getDetail(userId: string, cardId: string): Promise<CardDetail> {
    const row = await this.prisma.scenarioCard.findUnique({ where: { id: cardId } })

    // 未上线内容对学员不存在：返回 404 而不是 403，避免探测出草稿卡的存在
    if (!row || row.status !== 'published') {
      throw notFound('卡片不存在或尚未上线')
    }

    const [progress, review] = await Promise.all([
      this.prisma.userProgress.findUnique({
        where: { userId_cardId: { userId, cardId } },
      }),
      this.prisma.reviewSchedule.findUnique({
        where: { userId_cardId: { userId, cardId } },
      }),
    ])

    return {
      card: toScenarioCard(row),
      progress: progress
        ? {
            repeatScore: progress.repeatScore,
            answerScore: progress.answerScore,
            composite: progress.composite,
            doneAt: progress.doneAt.toISOString(),
            mode: progress.mode,
          }
        : null,
      review: review
        ? {
            stage: review.stage,
            dueAt: review.dueAt.toISOString(),
            lastScore: review.lastScore,
            timesReviewed: review.timesReviewed,
          }
        : null,
    }
  }
}
