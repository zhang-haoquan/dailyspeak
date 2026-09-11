import { Controller, Get } from '@nestjs/common'
import type { AuthUser, UserProfile } from '@dailyspeak/shared'
import { AuthService } from './auth.service'
import { CurrentUser } from './current-user.decorator'

/** 前端启动时的应用引导信息 */
export interface MeResponse {
  user: AuthUser
  profile: UserProfile
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 当前登录用户 + 画像。
   *
   * 前端启动时调这一个接口即可判断：
   *   - 401 → 未登录，去登录页
   *   - profile.onboarded = false → 去首次引导页（PRD 5.2）
   *   - 否则 → 进学习台
   */
  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    const profile = await this.authService.ensureProfile(user.id)
    return { user, profile }
  }
}
