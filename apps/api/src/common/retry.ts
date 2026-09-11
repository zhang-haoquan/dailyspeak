import { Logger } from '@nestjs/common'

/**
 * 第三方调用的重试（PRD 09 章）
 *
 * PRD 原文写「自动重试 3 次」。这句话有两种读法（总共 3 次，还是失败后再试 3 次），
 * 这里定死为**总共最多尝试 3 次**（首次 + 2 次重试），并在 PRD 12 章写清——
 * 4 次尝试配上指数退避最坏要等 6 秒以上，用户盯着转圈的体验不划算。
 */

export const MAX_ATTEMPTS = 3

/** 首次重试前等待，之后翻倍（300ms → 900ms） */
const BASE_DELAY_MS = 300

export interface RetryOptions {
  /** 最多尝试次数，默认 3 */
  maxAttempts?: number
  baseDelayMs?: number
  /** 每次重试前的回调，用于打日志 */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void
  /** 判断是否值得重试，默认都重试 */
  shouldRetry?: (error: unknown) => boolean
  /** 便于测试注入，避免真的等待 */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 指数退避重试。**耗尽次数后把最后一次的错误抛出去**，
 * 由调用方决定是降级还是 500——重试本身不吞异常。
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS
  const baseDelayMs = options.baseDelayMs ?? BASE_DELAY_MS
  const sleep = options.sleep ?? defaultSleep
  const logger = new Logger('Retry')

  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      lastError = err
      const isLast = attempt === maxAttempts
      if (isLast || (options.shouldRetry && !options.shouldRetry(err))) break

      const delayMs = baseDelayMs * attempt * attempt // 300 → 1200
      logger.warn(
        `第 ${attempt}/${maxAttempts} 次调用失败，${delayMs}ms 后重试：${describeError(err)}`,
      )
      options.onRetry?.(err, attempt, delayMs)
      await sleep(delayMs)
    }
  }
  throw lastError
}

/** 把任意异常压成一行短文本，用于日志与降级原因 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
