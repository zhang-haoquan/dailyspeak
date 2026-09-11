import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { LlmCompleteOptions, LlmMessage, LlmProvider } from './llm-provider'

/** 评测要输出四个维度 + 一句建议，推理模型还要先花一份推理预算，留足余量 */
const DEFAULT_MAX_TOKENS = 1500
const REQUEST_TIMEOUT_MS = 30_000

interface DeepSeekResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[]
  usage?: Record<string, unknown>
  model?: string
}

/**
 * DeepSeek（D-012），OpenAI 兼容接口。
 *
 * 两个实打实的坑（都是实测踩出来的，不是猜的）：
 * 1. **模型名不是 `deepseek-chat`**。这把 key 上 `/v1/models` 只返回
 *    `deepseek-flash` 与 `deepseek-v4-pro`；用不存在的名字会直接 400。
 * 2. **它是推理模型**：`max_tokens` 同时管推理与正文。给小了会「调用成功但 content 为空」，
 *    所以这里把默认值放大，并且把空正文当成失败抛出去——否则会静默产出 0 分。
 */
@Injectable()
export class DeepSeekLlmProvider implements LlmProvider {
  readonly name = 'deepseek'
  private readonly logger = new Logger(DeepSeekLlmProvider.name)

  constructor(private readonly config: ConfigService) {}

  async complete(messages: LlmMessage[], options: LlmCompleteOptions = {}): Promise<string> {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY')
    if (!apiKey) throw new Error('缺少 DEEPSEEK_API_KEY，无法调用大模型')

    const baseUrl = (this.config.get<string>('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com').replace(
      /\/$/,
      '',
    )
    const model = this.config.get<string>('DEEPSEEK_MODEL') ?? 'deepseek-flash'

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.2,
          max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    const raw = await res.text()
    if (!res.ok) {
      throw new Error(`DeepSeek 返回 HTTP ${res.status}：${raw.slice(0, 200)}`)
    }

    let parsed: DeepSeekResponse
    try {
      parsed = JSON.parse(raw) as DeepSeekResponse
    } catch {
      throw new Error(`DeepSeek 返回的不是 JSON：${raw.slice(0, 200)}`)
    }

    const choice = parsed.choices?.[0]
    const content = (choice?.message?.content ?? '').trim()
    if (!content) {
      // 推理预算被吃光时 finish_reason 通常是 length，把线索一起抛出去便于排查
      throw new Error(
        `DeepSeek 返回了空内容（finish_reason=${choice?.finish_reason ?? '?'}，` +
          `usage=${JSON.stringify(parsed.usage ?? {})}）`,
      )
    }

    this.logger.debug(`DeepSeek ${parsed.model ?? model} 返回 ${content.length} 字`)
    return content
  }
}
