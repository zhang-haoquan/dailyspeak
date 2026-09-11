import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ASR_PROVIDER } from './asr/asr-provider'
import { TencentAsrProvider } from './asr/tencent-asr.provider'
import { LLM_PROVIDER } from './llm/llm-provider'
import { DeepSeekLlmProvider } from './llm/deepseek-llm.provider'

/**
 * AI 供应商接线（D-011：ASR 与 LLM 只在后端调用，且可替换）
 *
 * 供应商选择走环境变量，业务代码只注入 `ASR_PROVIDER` / `LLM_PROVIDER` 两个令牌。
 * 加新供应商时只改这里 + 新增一个实现类，评分逻辑一行都不用动。
 */
@Module({
  providers: [
    {
      provide: ASR_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>('ASR_PROVIDER') ?? 'tencent'
        switch (provider) {
          case 'tencent':
            return new TencentAsrProvider(config)
          default:
            // 宁可启动即报错，也不要静默用一个"什么都识别不出来"的空实现
            throw new Error(`不支持的 ASR_PROVIDER：${provider}（目前只实现 tencent）`)
        }
      },
    },
    { provide: LLM_PROVIDER, useClass: DeepSeekLlmProvider },
  ],
  exports: [ASR_PROVIDER, LLM_PROVIDER],
})
export class AiModule {}
