import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { AuthModule } from './auth/auth.module'
import { JwtAuthGuard } from './auth/jwt-auth.guard'
import { CardsModule } from './cards/cards.module'
import { AllExceptionsFilter } from './common/all-exceptions.filter'
import { LoggingInterceptor } from './common/logging.interceptor'
import { HealthController } from './health/health.controller'
import { HistoryModule } from './history/history.module'
import { PrismaModule } from './prisma/prisma.module'
import { ProfileModule } from './profile/profile.module'
import { SupabaseModule } from './supabase/supabase.module'
import { TodayModule } from './today/today.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    SupabaseModule,
    AuthModule,
    ProfileModule,
    CardsModule,
    TodayModule,
    HistoryModule,
  ],
  controllers: [HealthController],
  providers: [
    // 全局默认鉴权：除 @Public() 标注的接口外，全部需要有效访问令牌
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 统一错误体 { code, message, details? }（D-030）
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // 每请求一行日志（D-030）
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
