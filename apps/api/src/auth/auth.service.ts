import { Injectable, Logger } from '@nestjs/common'
import { DAILY_COUNT_MAX, DAILY_COUNT_MIN, type UserProfile } from '@dailyspeak/shared'
import { PrismaService } from '../prisma/prisma.service'
import { toUserProfile } from '../profile/profile.mapper'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 确保 user_profiles 存在并返回它。
   *
   * 正常情况下由数据库触发器 `on_auth_user_created` 在注册时建好；
   * 这里是幂等兜底：触发器上线前注册的老用户、或触发器被误删的情况。
   */
  async ensureProfile(userId: string): Promise<UserProfile> {
    const existing = await this.prisma.userProfile.findUnique({ where: { userId } })
    if (existing) return toUserProfile(existing)

    this.logger.warn(`用户 ${userId} 缺少 profile，已补建`)
    const created = await this.prisma.userProfile.create({
      data: {
        userId,
        domains: [],
        // 默认值取 PRD 5.2 的建议值，且必须落在合法区间内
        dailyCount: Math.min(DAILY_COUNT_MAX, Math.max(DAILY_COUNT_MIN, 3)),
        onboarded: false,
      },
    })
    return toUserProfile(created)
  }
}
