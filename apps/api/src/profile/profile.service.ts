import { Injectable, Logger } from '@nestjs/common'
import {
  DAILY_COUNT_MAX,
  DAILY_COUNT_MIN,
  type Domain,
  type UserProfile,
} from '@dailyspeak/shared'
import { PrismaService } from '../prisma/prisma.service'
import { toUserProfile } from './profile.mapper'
import type { UpdateProfileDto } from './dto/update-profile.dto'

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name)

  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<UserProfile> {
    const row = await this.prisma.userProfile.findUnique({ where: { userId } })
    if (!row) {
      // 正常由注册触发器创建；这里兜底，避免历史数据缺 profile 时直接 500
      const created = await this.prisma.userProfile.create({
        data: { userId, domains: [], dailyCount: DAILY_COUNT_MIN, onboarded: false },
      })
      return toUserProfile(created)
    }
    return toUserProfile(row)
  }

  /** 保存学习计划并标记完成首次引导（PRD 5.2） */
  async save(userId: string, dto: UpdateProfileDto): Promise<UserProfile> {
    // PRD 5.2：条数越界按边界值截断，而不是报错
    const dailyCount = clampDailyCount(dto.dailyCount)
    if (dailyCount !== dto.dailyCount) {
      this.logger.warn(`用户 ${userId} 提交的每日条数 ${dto.dailyCount} 越界，已截断为 ${dailyCount}`)
    }

    const saved = await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        domains: dto.domains,
        dailyCount,
        onboarded: true,
      },
      update: {
        domains: dto.domains,
        dailyCount,
        onboarded: true,
      },
    })

    // 学习计划变了，今日任务快照作废（决策 D-004）
    await this.prisma.todayPlan.deleteMany({ where: { userId } })

    return toUserProfile(saved)
  }
}

/** 每日条数截断到 [1, 10]（PRD 5.2） */
export function clampDailyCount(value: number): number {
  if (!Number.isFinite(value)) return DAILY_COUNT_MIN
  return Math.min(DAILY_COUNT_MAX, Math.max(DAILY_COUNT_MIN, Math.trunc(value)))
}

/** 供其它模块复用的领域类型收窄 */
export type ProfileDomains = Domain[]
