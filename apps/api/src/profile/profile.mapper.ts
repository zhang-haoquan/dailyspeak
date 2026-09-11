import type { Domain, UserProfile } from '@dailyspeak/shared'
// 生成客户端的模型类型与 shared 的 UserProfile 同名，这里别名区分
import type { UserProfile as UserProfileRow } from '../generated/prisma/client'

/**
 * 数据库行 → 接口返回体。
 * 统一在这里转换，保证日期格式（ISO 字符串）与领域类型（Domain[]）在出口处收口。
 */
export function toUserProfile(row: UserProfileRow): UserProfile {
  return {
    userId: row.userId,
    domains: row.domains as Domain[],
    dailyCount: row.dailyCount,
    onboarded: row.onboarded,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
