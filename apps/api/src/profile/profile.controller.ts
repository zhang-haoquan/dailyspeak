import { Body, Controller, Get, Put } from '@nestjs/common'
import type { AuthUser, UserProfile } from '@dailyspeak/shared'
import { CurrentUser } from '../auth/current-user.decorator'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { ProfileService } from './profile.service'

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  /** 当前用户的学习计划 */
  @Get()
  get(@CurrentUser() user: AuthUser): Promise<UserProfile> {
    return this.profileService.get(user.id)
  }

  /** 首次引导保存 / 后续修改学习计划（PRD 5.2） */
  @Put()
  save(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto): Promise<UserProfile> {
    return this.profileService.save(user.id, dto)
  }
}
