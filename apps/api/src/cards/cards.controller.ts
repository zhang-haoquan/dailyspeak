import { Controller, Get, Param } from '@nestjs/common'
import type { AuthUser, CardDetail } from '@dailyspeak/shared'
import { CurrentUser } from '../auth/current-user.decorator'
import { CardsService } from './cards.service'
import { CardIdParam } from './dto/card-id.param'

@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  /** 卡片详情：学习页/结果页取内容、我的进度与复习阶段 */
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param() params: CardIdParam): Promise<CardDetail> {
    return this.cardsService.getDetail(user.id, params.id)
  }
}
