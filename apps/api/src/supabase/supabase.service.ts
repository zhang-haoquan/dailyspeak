import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AuthUser } from '@dailyspeak/shared'

/**
 * Supabase 服务端客户端。
 *
 * 用 secret key 构造，仅供后端使用——**绝不能下发到前端**。
 * 职责：校验用户访问令牌（JWT），以及后续可能用到的管理操作。
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name)
  private readonly client: SupabaseClient

  constructor() {
    const url = process.env.SUPABASE_URL
    const secretKey = process.env.SUPABASE_SECRET_KEY
    if (!url || !secretKey) {
      throw new Error('缺少环境变量 SUPABASE_URL / SUPABASE_SECRET_KEY，请参考 apps/api/.env.example')
    }
    this.client = createClient(url, secretKey, {
      auth: {
        // 服务端不维护会话，每次都用显式传入的 token
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  }

  onModuleInit(): void {
    this.logger.log('Supabase 客户端已就绪')
  }

  /**
   * 用访问令牌换取用户。
   *
   * 走 Auth 服务校验而不是本地验签，好处是能同时确认「用户仍然存在、未被封禁」；
   * 代价是每个请求多一次到 Supabase 的往返。流量上来后可改为本地 JWKS 验签 + 缓存。
   */
  async getUserFromToken(accessToken: string): Promise<AuthUser | null> {
    const { data, error } = await this.client.auth.getUser(accessToken)
    if (error || !data.user) return null
    const u = data.user
    return {
      id: u.id,
      email: u.email ?? '',
      emailVerified: Boolean(u.email_confirmed_at),
      createdAt: u.created_at,
    }
  }
}
