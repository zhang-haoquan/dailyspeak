import { Module } from '@nestjs/common'
import { CardsController } from './cards.controller'
import { CardsService } from './cards.service'

@Module({
  controllers: [CardsController],
  providers: [CardsService],
  // 今日任务也要按 id 取内容，复用同一套读逻辑
  exports: [CardsService],
})
export class CardsModule {}
