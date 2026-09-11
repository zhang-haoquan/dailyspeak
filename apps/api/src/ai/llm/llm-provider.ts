/**
 * LLM 供应商抽象 —— PRD 06 / 08 章
 *
 * 目前只用于「情境应答」的四维评测。业务代码不关心是 DeepSeek 还是别家。
 * 具体实现见 `deepseek-llm.provider.ts`。
 */

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmCompleteOptions {
  temperature?: number
  /**
   * 可见输出的 token 上限。
   *
   * ⚠️ `deepseek-flash` / `deepseek-v4-pro` 都是**推理模型**：
   * 它们会先产出 reasoning token 再产出正文，两者共用这个预算。
   * 给得太小（实测 ≤ 8）会出现「请求成功、content 为空串」——
   * 这不是错误，但拿不到结果，所以实现里必须显式检查空正文。
   */
  maxTokens?: number
}

export interface LlmProvider {
  readonly name: string
  /** 返回模型产出的纯文本（不含 markdown 围栏） */
  complete(messages: LlmMessage[], options?: LlmCompleteOptions): Promise<string>
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER')
