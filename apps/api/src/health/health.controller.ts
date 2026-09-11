import { Controller, Get } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { Public } from '../auth/public.decorator'

/**
 * 健康检查：确认进程存活 + 数据库连通。
 * 无需登录（@Public），供探活与部署检查使用。
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(): Promise<{
    ok: boolean
    db: boolean
    cards: number
    time: string
  }> {
    let db = false
    let cards = 0
    try {
      cards = await this.prisma.scenarioCard.count()
      db = true
    } catch {
      db = false
    }
    return { ok: db, db, cards, time: new Date().toISOString() }
  }
}
