import { Controller, Get } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/**
 * 健康检查：确认进程存活 + 数据库连通。
 * Phase 1 S1 的验收入口之一。
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

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
