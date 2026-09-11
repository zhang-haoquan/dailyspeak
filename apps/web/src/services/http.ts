import type { ApiErrorBody, ApiErrorCode } from '@dailyspeak/shared'
import { supabase } from './supabase'

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

export interface RequestOptions extends Omit<RequestInit, 'body'> {
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

/**
 * 取当前会话的访问令牌。
 *
 * supabase-js 开了 `autoRefreshToken`，令牌快过期时 `getSession()` 会自动刷新，
 * 所以这里拿到的基本都是可用的——**不需要自己写 401 刷新重试**。
 * 真的刷新失败（refresh token 也过期）时会话会被清空，那时返回 null。
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/**
 * 带登录态的请求：自动注入令牌。
 * 没有会话时**不发请求**，直接抛 401——省掉一次必然失败的往返。
 */
export async function authedFetch<T>(
  path: string,
  options: Omit<RequestOptions, 'token'> = {},
): Promise<T> {
  const token = await getAccessToken()
  if (!token) {
    throw new ApiError(401, '登录状态已失效，请重新登录', 'UNAUTHORIZED')
  }
  return apiFetch<T>(path, { ...options, token })
}
