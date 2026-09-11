import { Module } from '@nestjs/common'
import { ProfileModule } from '../profile/profile.module'
import { TodayController } from './today.controller'
import { TodayService } from './today.service'

@Module({
  imports: [ProfileModule],
  controllers: [TodayController],
  providers: [TodayService],
})
export class TodayModule {}
