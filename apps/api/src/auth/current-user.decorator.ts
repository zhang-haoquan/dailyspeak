import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { AuthUser } from '@dailyspeak/shared'
import type { AuthedRequest } from './authed-request'

/**
 * 取当前登录用户。
 * 依赖 JwtAuthGuard 已经把用户挂到 request 上，所以只用于受保护的接口。
 *
 *   @Get('me')
 *   me(@CurrentUser() user: AuthUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>()
    return req.user
  },
)
