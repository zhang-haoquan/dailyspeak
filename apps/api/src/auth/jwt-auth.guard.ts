import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { SupabaseService } from '../supabase/supabase.service'
import { IS_PUBLIC_KEY } from './public.decorator'
import type { AuthedRequest } from './authed-request'

/** 从 Authorization 头里取 Bearer 令牌 */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (!token || scheme.toLowerCase() !== 'bearer') return null
  return token.trim() || null
}

/**
 * 全局鉴权守卫：默认所有接口都需要有效的 Supabase 访问令牌。
 * 例外：带 @Public() 的接口（如健康检查）。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const req = context.switchToHttp().getRequest<AuthedRequest>()

    const token = extractBearerToken(req.headers.authorization)
    if (!token) {
      throw new UnauthorizedException('缺少访问令牌')
    }

    const user = await this.supabase.getUserFromToken(token)
    if (!user) {
      throw new UnauthorizedException('登录状态已失效，请重新登录')
    }

    req.user = user
    return true
  }
}
