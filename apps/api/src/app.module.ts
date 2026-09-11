import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { AuthModule } from './auth/auth.module'
import { JwtAuthGuard } from './auth/jwt-auth.guard'
import { HealthController } from './health/health.controller'
import { PrismaModule } from './prisma/prisma.module'
import { ProfileModule } from './profile/profile.module'
import { SupabaseModule } from './supabase/supabase.module'

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
  ],
  controllers: [HealthController],
  providers: [
    // 全局默认鉴权：除 @Public() 标注的接口外，全部需要有效访问令牌
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
