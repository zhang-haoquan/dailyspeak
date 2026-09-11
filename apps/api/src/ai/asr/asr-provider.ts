/**
 * ASR（语音转文字）供应商抽象 —— PRD 06 / 08 章
 *
 * 业务代码只依赖这个接口，换供应商（D-011 要求可替换）时不动评分逻辑。
 * 具体实现见 `tencent-asr.provider.ts`。
 */
import type { TranscriptSource } from '@dailyspeak/shared'

export interface AsrInput {
  /** 音频字节（服务端只接受 16kHz 单声道 16-bit PCM WAV，见 AUDIO_LIMITS） */
  audio: Buffer
  /** 音频时长（毫秒），由服务端解析 WAV 头得出，不信任客户端上报 */
  durationMs: number
}

export interface AsrResult {
  /** 识别出的文本；识别不到内容时为空串（不是错误） */
  text: string
  /** 供应商标识，会随结果下发并在界面上如实标注 */
  provider: TranscriptSource
  /** 供应商回报的音频时长（毫秒），用于与本地解析结果对账 */
  durationMs?: number
}

export interface AsrProvider {
  readonly name: TranscriptSource
  transcribe(input: AsrInput): Promise<AsrResult>
}

/** DI 注入令牌（NestJS 用 Symbol 做接口注入，避免和类名耦合） */
export const ASR_PROVIDER = Symbol('ASR_PROVIDER')
