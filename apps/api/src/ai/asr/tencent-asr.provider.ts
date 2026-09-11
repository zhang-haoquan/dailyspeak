import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { TranscriptSource } from '@dailyspeak/shared'
import type { AsrInput, AsrProvider, AsrResult } from './asr-provider'

/** 一句话识别的硬性上限（腾讯云文档） */
const MAX_AUDIO_BYTES = 3 * 1024 * 1024 // base64 后 ≤ 3MB
const REQUEST_TIMEOUT_SECONDS = 20

/**
 * 腾讯云「一句话识别」`SentenceRecognition`（D-013）
 *
 * 同步返回，适合跟读这种 3–15 秒的短音频；异步的 `CreateRecTask` 用于长录音，
 * 本项目不需要（一句话识别每月 5000 次免费额度足够 MVP）。
 *
 * 参数口径（已按官方 SDK 类型定义核实字段名）：
 * - `EngSerViceType = 16k_en`：16k 英文引擎（非电话场景）
 * - `SourceType = 1`：直接上传音频数据（不是 URL）
 * - `VoiceFormat = 'wav'`：腾讯**不支持 webm**，前端必须先转码
 * - `Data` = base64（不能带换行）、`DataLen` = **未编码前**的字节数
 */
@Injectable()
export class TencentAsrProvider implements AsrProvider {
  readonly name: TranscriptSource = 'tencent-asr'
  private readonly logger = new Logger(TencentAsrProvider.name)
  private client: unknown = null

  constructor(private readonly config: ConfigService) {}

  private async getClient(): Promise<TencentAsrClient> {
    if (this.client) return this.client as TencentAsrClient

    const secretId = this.config.get<string>('TENCENT_SECRET_ID')
    const secretKey = this.config.get<string>('TENCENT_SECRET_KEY')
    if (!secretId || !secretKey) {
      throw new Error('缺少 TENCENT_SECRET_ID / TENCENT_SECRET_KEY，无法调用腾讯云语音识别')
    }

    // 延迟加载 SDK：没配密钥时也要能启动服务（只在使用时报错）
    const mod = await import('tencentcloud-sdk-nodejs-asr')
    const sdk = (mod as unknown as { default?: typeof mod }).default ?? mod
    const AsrClient = sdk.asr.v20190614.Client

    this.client = new AsrClient({
      credential: { secretId, secretKey },
      region: this.config.get<string>('TENCENT_ASR_REGION') ?? 'ap-guangzhou',
      profile: {
        httpProfile: {
          endpoint: 'asr.tencentcloudapi.com',
          reqTimeout: REQUEST_TIMEOUT_SECONDS,
        },
      },
    })
    return this.client as TencentAsrClient
  }

  async transcribe(input: AsrInput): Promise<AsrResult> {
    const base64 = input.audio.toString('base64')
    if (Buffer.byteLength(base64) > MAX_AUDIO_BYTES) {
      // 走到这里说明上游的时长/体积校验漏了，属于程序错误而非用户输入问题
      throw new Error(
        `音频过大：base64 后 ${(Buffer.byteLength(base64) / 1024 / 1024).toFixed(2)}MB，超过 3MB 上限`,
      )
    }

    const client = await this.getClient()
    const engine = this.config.get<string>('TENCENT_ASR_ENGINE') ?? '16k_en'

    const rep = await client.SentenceRecognition({
      EngSerViceType: engine,
      SourceType: 1,
      VoiceFormat: 'wav',
      Data: base64,
      DataLen: input.audio.length,
    })

    const text = (rep?.Result ?? '').trim()
    // 识别为空不是异常：用户可能没说话，或说的是纯噪音
    if (!text) {
      this.logger.warn(`腾讯云未识别出内容（音频 ${input.durationMs}ms，RequestId ${rep?.RequestId}）`)
    }

    return {
      text,
      provider: this.name,
      durationMs: rep?.AudioDuration,
    }
  }
}

/** SDK 客户端的最小结构（只用到这一个方法，不必拉全量类型） */
interface TencentAsrClient {
  SentenceRecognition(params: {
    EngSerViceType: string
    SourceType: number
    VoiceFormat: string
    Data: string
    DataLen: number
  }): Promise<{ Result?: string; AudioDuration?: number; RequestId?: string }>
}
