/**
 * 账号与个性化设置（PRD 5.1 / 5.2 / 07 章）
 *
 * 注意：真正的账号与密码由 Supabase Auth 托管，
 * 服务端只保存 profile，且**任何接口都不得返回密码相关字段**。
 */

import type { Domain } from './domain'

/** 当前登录用户（由服务端从 JWT 解出后返回给前端） */
export interface AuthUser {
  id: string
  email: string
  /** 邮箱是否已验证 */
  emailVerified: boolean
  createdAt: string
}

/** 用户画像（个性化设置） */
export interface UserProfile {
  userId: string
  /** 已选领域，1–3 个 */
  domains: Domain[]
  /** 每日学习条数（含复习），1–10 */
  dailyCount: number
  /** 是否已完成首次引导 */
  onboarded: boolean
  createdAt: string
  updatedAt: string
}

/** 每日条数的合法范围（PRD 5.2） */
export const DAILY_COUNT_MIN = 1
export const DAILY_COUNT_MAX = 10
/** 领域可选数量上限 */
export const DOMAIN_SELECT_MAX = 3
