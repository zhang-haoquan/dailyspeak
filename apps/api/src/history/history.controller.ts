import { Controller, Get } from '@nestjs/common'
import type { AuthUser, HistoryStats } from '@dailyspeak/shared'
import { CurrentUser } from '../auth/current-user.decorator'
import { HistoryService } from './history.service'

@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  /** 学习记录页统计（PRD 5.6） */
  @Get()
  get(@CurrentUser() user: AuthUser): Promise<HistoryStats> {
    return this.historyService.getStats(user.id)
  }
}
