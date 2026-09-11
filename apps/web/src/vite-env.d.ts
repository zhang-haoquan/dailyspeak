/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端 API 地址，如 http://localhost:3000 */
  readonly VITE_API_BASE_URL: string
  /** Supabase 项目地址 */
  readonly VITE_SUPABASE_URL: string
  /** Supabase publishable key（可公开，会进前端产物） */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
