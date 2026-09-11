import 'dotenv/config'
import { defineConfig } from 'prisma/config'

/**
 * Prisma v7 配置（中心化配置，取代 schema 里的 datasource.url）。
 * 连接串来自 apps/api/.env 的 DATABASE_URL。
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
})
