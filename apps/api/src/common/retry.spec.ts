/**
 * 重试策略单测（PRD 09 章）
 *
 * PRD 原文「自动重试 3 次」有歧义，这里定死为**总共最多尝试 3 次**，
 * 所以断言的是「最多被调用 3 次」，不是 4 次。
 */
import { MAX_ATTEMPTS, describeError, withRetry } from './retry'

/** 不真的等待 */
const noSleep = async () => undefined

describe('withRetry', () => {
  it('第一次就成功时只调用一次', async () => {
    let calls = 0
    const result = await withRetry(async () => {
      calls++
      return 'ok'
    }, { sleep: noSleep })
    expect(result).toBe('ok')
    expect(calls).toBe(1)
  })

  it('前两次失败、第三次成功：总共调用 3 次', async () => {
    let calls = 0
    const result = await withRetry(
      async () => {
        calls++
        if (calls < 3) throw new Error('boom')
        return 'ok'
      },
      { sleep: noSleep },
    )
    expect(result).toBe('ok')
    expect(calls).toBe(3)
  })

  it('一直失败：调用次数封顶在 3 次，并把最后一次的错误抛出', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw new Error(`fail-${calls}`)
        },
        { sleep: noSleep },
      ),
    ).rejects.toThrow('fail-3')
    expect(calls).toBe(MAX_ATTEMPTS)
    expect(MAX_ATTEMPTS).toBe(3)
  })

  it('退避是递增的（300ms → 1200ms），不是固定间隔', async () => {
    const delays: number[] = []
    await expect(
      withRetry(async () => {
        throw new Error('boom')
      }, {
        sleep: async (ms) => {
          delays.push(ms)
        },
      }),
    ).rejects.toThrow()
    expect(delays).toEqual([300, 1200])
    expect(delays[1]).toBeGreaterThan(delays[0])
  })

  it('shouldRetry 返回 false 时不再重试（例如 4xx 这类改不了结果的错误）', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw Object.assign(new Error('bad request'), { status: 400 })
        },
        { sleep: noSleep, shouldRetry: (err) => (err as { status?: number }).status !== 400 },
      ),
    ).rejects.toThrow('bad request')
    expect(calls).toBe(1)
  })

  it('onRetry 回调带上第几次与等待时长', async () => {
    const seen: [number, number][] = []
    await expect(
      withRetry(
        async () => {
          throw new Error('boom')
        },
        { sleep: noSleep, onRetry: (_e, attempt, delay) => seen.push([attempt, delay]) },
      ),
    ).rejects.toThrow()
    expect(seen).toEqual([
      [1, 300],
      [2, 1200],
    ])
  })

  it('attempt 从 1 开始传给被调用函数', async () => {
    const attempts: number[] = []
    await withRetry(async (attempt) => {
      attempts.push(attempt)
      if (attempt < 2) throw new Error('boom')
      return 'ok'
    }, { sleep: noSleep })
    expect(attempts).toEqual([1, 2])
  })
})

describe('describeError', () => {
  it('Error 取 message', () => {
    expect(describeError(new Error('磁盘满了'))).toBe('磁盘满了')
  })

  it('非 Error 也能压成一行', () => {
    expect(describeError('字符串错误')).toBe('字符串错误')
    expect(describeError({ code: 'X' })).toBe('[object Object]')
  })
})
