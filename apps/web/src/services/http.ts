import type { ApiErrorBody, ApiErrorCode } from '@dailyspeak/shared'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

/** 后端返回的结构化错误 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: ApiErrorCode,
    readonly details?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** 登录态失效，调用方通常需要跳回登录页 */
  get isUnauthorized(): boolean {
    return this.status === 401
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** 访问令牌，会自动放进 Authorization 头 */
  token?: string | null
  /** JSON 请求体 */
  body?: unknown
}

/**
 * 统一的 API 请求封装。
 *
 * - 自动拼接 `/api` 前缀与 base URL
 * - 自动注入 Bearer 令牌
 * - 把后端的 { code, message, details } 错误转成 ApiError
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, body, headers, ...rest } = options

  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...rest,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const raw = await res.text()
  let parsed: unknown = null
  if (raw) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = null
    }
  }

  if (!res.ok) {
    const err = parsed as ApiErrorBody | null
    throw new ApiError(
      res.status,
      err?.message ?? `请求失败（HTTP ${res.status}）`,
      err?.code,
      err?.details,
    )
  }

  return parsed as T
}
