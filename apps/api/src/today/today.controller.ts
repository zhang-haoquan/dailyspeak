import { Controller, Get } from '@nestjs/common'
import type { AuthUser, TodayPlanResponse } from '@dailyspeak/shared'
import { CurrentUser } from '../auth/current-user.decorator'
import { TodayService } from './today.service'

@Controller('today')
export class TodayController {
  constructor(private readonly todayService: TodayService) {}

  /**
   * 今日任务（PRD 5.3）。
   * 注意：这是 GET，但当天首次调用会生成并落库快照——快照生成是幂等的。
   */
  @Get()
  get(@CurrentUser() user: AuthUser): Promise<TodayPlanResponse> {
    return this.todayService.getToday(user.id)
  }
}
