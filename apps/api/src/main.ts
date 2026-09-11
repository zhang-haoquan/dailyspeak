import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false })

  // 统一 API 前缀（见 docs/DECISIONS.md 技术选型）
  app.setGlobalPrefix('api')

  // DTO 校验：剔除未声明字段，自动类型转换
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )

  // 本地开发允许前端源；上线时按 D-020 补白名单
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  app.enableCors({ origin: origins, credentials: true })

  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port)
  new Logger('Bootstrap').log(`DailySpeak API 已启动：http://localhost:${port}/api`)
}

void bootstrap()
