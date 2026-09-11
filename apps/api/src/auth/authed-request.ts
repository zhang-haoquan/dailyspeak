import type { AuthUser } from '@dailyspeak/shared'
import type { Request } from 'express'

/** 已通过 JwtAuthGuard 的请求 */
export interface AuthedRequest extends Request {
  user: AuthUser
}
