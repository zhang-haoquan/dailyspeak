import { createClient } from '@supabase/supabase-js'

/**
 * 浏览器端 Supabase 客户端（只做身份认证）。
 *
 * 用 publishable key，设计上可公开；**secret key 绝不能出现在前端**。
 * 业务数据一律走后端 /api，前端不直接读写数据库。
 */
const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error(
    '缺少 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY，请参考 apps/web/.env.example 配置',
  )
}

export const supabase = createClient(url, publishableKey, {
  auth: {
    // 会话持久化在 localStorage，刷新后仍保持登录（PRD 5.1：登录状态由 JWT/Session 维持）
    persistSession: true,
    autoRefreshToken: true,
    // 点击邮件里的验证链接跳回来时，自动从 URL 里提取会话
    detectSessionInUrl: true,
  },
})
