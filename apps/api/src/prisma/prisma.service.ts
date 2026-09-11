import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

/**
 * Prisma 客户端封装。
 *
 * Prisma v7 起 SQL 连接必须走 driver adapter：
 * 这里用 @prisma/adapter-pg + pg，连接串来自 DATABASE_URL。
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

  constructor() {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('缺少环境变量 DATABASE_URL，请参考 apps/api/.env.example 配置')
    }
    super({ adapter: new PrismaPg({ connectionString }) })
  }

  async onModuleInit(): Promise<void> {
    await this.$connect()
    this.logger.log('数据库连接已建立')
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
