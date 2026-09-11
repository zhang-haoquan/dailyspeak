import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  ANSWER_DIMENSION_WEIGHTS,
  AUDIO_LIMITS,
  compositeScore,
  repeatScoreFromSimilarity,
  type AnswerScore,
  type LearningMode,
  type RepeatScore,
  type ScoreFeedback,
} from '@dailyspeak/shared'
import { ASR_PROVIDER, type AsrProvider, type AsrResult } from '../ai/asr/asr-provider'
import { LLM_PROVIDER, type LlmProvider } from '../ai/llm/llm-provider'
import { badRequest, notFound } from '../common/api-errors'
import { describeError, withRetry } from '../common/retry'
import { PrismaService } from '../prisma/prisma.service'
import { isDue, scheduleFirstReview, scheduleNextReview } from '../review/review.schedule'
import { alignWords, type AlignResult } from './word-align'
import { assertDuration, InvalidAudioError, parseWavHeader } from './wav'

/** 降级时给用户看的原因（第三方确实不可用，不是用户的错） */
const DEGRADED_REASON = '语音评测服务暂时不可用，本次已记录完成但未打分，稍后可重测'

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ASR_PROVIDER) private readonly asr: AsrProvider,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  // ---------------------------------------------------------------- 跟读

  /**
   * 跟读评测（PRD 6 章）
   *
   * 链路：校验音频 → ASR 转写 → 与原句词级对齐 → 相似度映射成分数 → 反馈 → 落库。
   * 分数**完全由词级相似度决定**（D-008），没有任何随机扰动。
   */
  async scoreRepeat(userId: string, cardId: string, audio: Buffer): Promise<RepeatScore> {
    const card = await this.loadCard(cardId)
    const info = this.validateAudio(audio, 'repeat', '跟读')

    const asr = await this.tryTranscribe(audio, info.durationMs)
    if (!asr.ok) {
      await this.recordCompletionWithoutScore(userId, cardId)
      return {
        degraded: true,
        score: null,
        degradedReason: DEGRADED_REASON,
        feedback: [{ ok: false, text: '本次没有产生打分，稍后重测即可' }],
      }
    }

    const transcript = this.requireSpeech(asr.value)

    const align = alignWords(card.sentence, transcript.text)
    const score = repeatScoreFromSimilarity(align.similarity)

    const mode = await this.resolveMode(userId, cardId)
    await this.prisma.userProgress.upsert({
      where: { userId_cardId: { userId, cardId } },
      create: { userId, cardId, repeatScore: score, doneAt: new Date(), mode },
      // 不动 answerScore：跟读这一步不应该覆盖已经拿到的应答分
      update: { repeatScore: score, doneAt: new Date(), mode },
    })

    return {
      degraded: false,
      score,
      feedback: buildRepeatFeedback(score, align, card.sentence),
      transcript: transcript.text,
      transcriptSource: transcript.provider,
      alignment: align.words,
      similarity: align.similarity,
    }
  }

  // ------------------------------------------------------------ 情境应答

  /**
   * 情境应答评测（PRD 6 章）
   *
   * 链路：校验音频 → ASR 转写 → DeepSeek 四维评测 → 综合分 → 落库 → **整卡完成时推进排期**。
   * 排期只在这时推进一次（D-006），跟读阶段不碰排期。
   */
  async scoreAnswer(userId: string, cardId: string, audio: Buffer): Promise<AnswerScore> {
    const card = await this.loadCard(cardId)
    const info = this.validateAudio(audio, 'answer', '情境应答')

    const asr = await this.tryTranscribe(audio, info.durationMs)
    if (!asr.ok) {
      await this.recordCompletionWithoutScore(userId, cardId)
      return {
        degraded: true,
        score: null,
        degradedReason: DEGRADED_REASON,
        feedback: [{ ok: false, text: '本次没有产生打分，稍后重测即可' }],
      }
    }

    const transcript = this.requireSpeech(asr.value)

    let evaluated: LlmEvaluation
    try {
      const raw = await withRetry(
        () =>
          this.llm.complete(
            [
              { role: 'system', content: EVALUATOR_SYSTEM_PROMPT },
              { role: 'user', content: buildEvaluatorUserPrompt(card.prompt, card.referenceAnswer, transcript.text) },
            ],
            // temperature 0：同一个回答重复提交应尽量得到同一个分数。
            // 用户对分数的稳定性很敏感（"我说的一样，怎么这次少了 6 分"）。
            { temperature: 0 },
          ),
        { onRetry: (err, attempt) => this.logger.warn(`应答评测第 ${attempt} 次失败：${describeError(err)}`) },
      )
      evaluated = parseEvaluation(raw)
    } catch (err) {
      // ASR 成功了、LLM 失败：仍然把转写回显给用户（那是有效信息），但不打分
      this.logger.error(`应答评测降级：${describeError(err)}`)
      await this.recordCompletionWithoutScore(userId, cardId)
      return {
        degraded: true,
        score: null,
        degradedReason: DEGRADED_REASON,
        feedback: [{ ok: false, text: '本次没有产生打分，稍后重测即可' }],
        transcript: transcript.text,
        transcriptSource: transcript.provider,
      }
    }

    const mode = await this.resolveMode(userId, cardId)
    const existing = await this.prisma.userProgress.findUnique({
      where: { userId_cardId: { userId, cardId } },
    })
    // 综合分 = 跟读 × 0.5 + 应答 × 0.5（PRD 5.5）。没做过跟读就拿不到综合分。
    const composite =
      existing?.repeatScore != null ? compositeScore(existing.repeatScore, evaluated.score) : null

    await this.prisma.userProgress.upsert({
      where: { userId_cardId: { userId, cardId } },
      create: {
        userId,
        cardId,
        answerScore: evaluated.score,
        composite,
        doneAt: new Date(),
        mode,
      },
      // 不动 repeatScore，只补应答分与综合分
      update: { answerScore: evaluated.score, composite, doneAt: new Date(), mode },
    })

    if (composite !== null) {
      await this.advanceSchedule(userId, cardId, composite)
    }

    return {
      degraded: false,
      score: evaluated.score,
      dimensions: evaluated.dimensions,
      feedback: evaluated.feedback,
      suggestion: evaluated.suggestion,
      transcript: transcript.text,
      transcriptSource: transcript.provider,
    }
  }

  // ---------------------------------------------------------------- 内部

  private async loadCard(cardId: string) {
    const card = await this.prisma.scenarioCard.findUnique({ where: { id: cardId } })
    if (!card || card.status !== 'published') {
      throw notFound('卡片不存在或尚未上线')
    }
    return card
  }

  /** 服务端权威校验：格式、采样率、声道、时长窗口 */
  private validateAudio(audio: Buffer, kind: 'repeat' | 'answer', label: string) {
    if (audio.length > AUDIO_LIMITS.maxBytes) {
      throw badRequest(
        `音频过大（${(audio.length / 1024 / 1024).toFixed(1)}MB），请重新录制`,
      )
    }
    try {
      const info = parseWavHeader(audio)
      assertDuration(
        { ...AUDIO_LIMITS[kind], label },
        info,
        { sampleRate: AUDIO_LIMITS.targetSampleRate, channels: AUDIO_LIMITS.targetChannels },
      )
      return info
    } catch (err) {
      // 音频本身的问题都是用户可修复的，转成 400 而不是 500
      if (err instanceof InvalidAudioError) throw badRequest(err.message)
      throw err
    }
  }

  /**
   * ASR 转写（最多尝试 3 次）。
   * 返回结果对象而不是抛异常——调用方要区分「第三方挂了」和「真的没说话」。
   */
  private async tryTranscribe(
    audio: Buffer,
    durationMs: number,
  ): Promise<{ ok: true; value: AsrResult } | { ok: false; error: unknown }> {
    try {
      const value = await withRetry(() => this.asr.transcribe({ audio, durationMs }), {
        onRetry: (err, attempt) => this.logger.warn(`ASR 第 ${attempt} 次失败：${describeError(err)}`),
      })
      return { ok: true, value }
    } catch (error) {
      this.logger.error(`ASR 重试耗尽，降级为「仅记完成、不打分」：${describeError(error)}`)
      return { ok: false, error }
    }
  }

  /**
   * 识别结果为空是**用户可修复的输入问题**，不是打分失败：
   * 返回 400 让用户重录，而不是伪造一个 40 分塞进历史记录。
   */
  private requireSpeech(asr: AsrResult): AsrResult {
    if (!asr.text) {
      throw badRequest('没有识别到任何内容，请靠近麦克风、大声朗读后重试')
    }
    return asr
  }

  /**
   * 学习模式由服务端判定。
   *
   * 判据是「排期是否**已到期**」，而不是「排期是否存在」：
   * 一张刚学完的新卡会立刻拿到次日到期的排期，如果只看存在性，
   * 当天再练一次就会被记成复习；而同一天重复练一张卡本来就不是复习。
   * 这个判据和 `advanceSchedule` 保持一致，避免两处口径打架。
   */
  private async resolveMode(userId: string, cardId: string): Promise<LearningMode> {
    const schedule = await this.prisma.reviewSchedule.findUnique({
      where: { userId_cardId: { userId, cardId } },
      select: { dueAt: true },
    })
    return schedule && isDue(schedule.dueAt) ? 'review' : 'new'
  }

  /**
   * 降级：按 PRD 09「仅记已完成、不产生打分」。
   *
   * 只更新完成时间，**不动已有分数**——上一次拿到 88 分，不能因为这次第三方挂了就抹掉。
   */
  private async recordCompletionWithoutScore(userId: string, cardId: string): Promise<void> {
    const mode = await this.resolveMode(userId, cardId)
    await this.prisma.userProgress.upsert({
      where: { userId_cardId: { userId, cardId } },
      create: { userId, cardId, doneAt: new Date(), mode },
      update: { doneAt: new Date(), mode },
    })
  }

  /**
   * 整卡完成后推进复习排期（D-006：一次只推进一级）。
   *
   * 额外加一条：**只在当前排期已经到期时才推进**。
   * 否则用户对同一张卡反复点「再次练习」，一天就能把 S1 一路推到 S6，
   * 遗忘曲线直接失效。不到期就只是重新练习，不改排期。
   */
  private async advanceSchedule(userId: string, cardId: string, composite: number): Promise<void> {
    const now = new Date()
    const current = await this.prisma.reviewSchedule.findUnique({
      where: { userId_cardId: { userId, cardId } },
    })

    if (!current) {
      const first = scheduleFirstReview(composite, now)
      await this.prisma.reviewSchedule.create({
        data: { userId, cardId, ...first },
      })
      return
    }

    if (!isDue(current.dueAt, now)) {
      this.logger.log(`卡片 ${cardId} 排期未到期，本次只记进度不推进阶段`)
      return
    }

    const next = scheduleNextReview(current, composite, now)
    await this.prisma.reviewSchedule.update({
      where: { userId_cardId: { userId, cardId } },
      data: next,
    })
  }
}

// ------------------------------------------------------------ 反馈与解析

/**
 * 跟读反馈**必须从词级 diff 生成**（PRD 6 章）：
 * 说「这几个词被听成了别的词：cut → cat」比说「发音不准」有用得多。
 */
export function buildRepeatFeedback(score: number, align: AlignResult, sentence: string): ScoreFeedback[] {
  const list: ScoreFeedback[] = []
  const wrong = align.words.filter((w) => !w.ok)
  const replaced = wrong.filter((w) => w.said)
  const missing = wrong.filter((w) => !w.said)

  if (wrong.length === 0) {
    list.push({ ok: true, text: '整句每个词都识别正确，发音清晰' })
  }
  if (replaced.length > 0) {
    const detail = replaced
      .slice(0, 3)
      .map((w) => `${w.word} → ${w.said}`)
      .join('、')
    list.push({ ok: false, text: `这几个词被听成了别的词：${detail}，发音需要再清晰一些` })
  }
  if (missing.length > 0) {
    const detail = missing
      .slice(0, 4)
      .map((w) => w.word)
      .join('、')
    list.push({ ok: false, text: `没有识别到「${detail}」，可能是漏读或连读含混` })
  }

  if (align.similarity >= 0.95) {
    list.push({ ok: true, text: '重音与连读位置基本准确' })
  } else if (align.similarity >= 0.8) {
    list.push({ ok: true, text: '整体连贯，个别词放慢重读会更清楚' })
  } else {
    const tail = sentence.split(/\s+/).slice(-2).join(' ')
    list.push({
      ok: false,
      text: score >= 70 ? '个别词没读准，建议对着原声逐词跟一遍' : `「${tail}」附近丢词较多，建议逐词跟读`,
    })
  }
  return list
}

const EVALUATOR_SYSTEM_PROMPT = `You are an English speaking examiner for Chinese job-seekers (CET-4 level).
You evaluate a candidate's spoken answer to an interview question, based on the speech-to-text transcript.
Return STRICT JSON only — no markdown fence, no explanation — with exactly this shape:
{"content":<0-100>,"grammar":<0-100>,"fluency":<0-100>,"vocabulary":<0-100>,"suggestion":"<one sentence of advice in Chinese>"}
Dimension meaning:
- content: does the answer actually address the question, with concrete substance
- grammar: tense, agreement, sentence structure
- fluency: coherence, connectors, absence of filler words (um, uh) and false starts
- vocabulary: range and precision of word choice
Scoring bands: 85-100 excellent, 70-84 good, 55-69 mediocre with clear problems, below 55 poor.
Be strict and specific — a vague or off-topic answer must NOT score above 75.
The transcript comes from speech recognition, so ignore missing punctuation and casing.`

export function buildEvaluatorUserPrompt(
  question: string,
  referenceAnswer: string | null,
  transcript: string,
): string {
  const lines = [`Interview question: ${question}`]
  if (referenceAnswer) {
    lines.push(`A model answer for reference (do not require the candidate to match it): ${referenceAnswer}`)
  }
  lines.push(`Candidate transcript: ${transcript}`)
  return lines.join('\n')
}

export interface LlmEvaluation {
  score: number
  dimensions: Record<keyof typeof ANSWER_DIMENSION_WEIGHTS, number>
  feedback: ScoreFeedback[]
  suggestion: string
}

/**
 * 解析并**校验**模型返回的四维分。
 * 模型偶尔会加 markdown 围栏或前后缀，所以先尝试直接解析、再退化为提取第一个 JSON 对象。
 * 任何一个维度缺失或不是数字都抛错——抛错会触发重试，比默认成 0 分安全。
 */
export function parseEvaluation(raw: string): LlmEvaluation {
  const parsed = tryParseJson(raw)
  if (!parsed) {
    throw new Error(`无法解析评测结果：${raw.slice(0, 200)}`)
  }

  const dimensions = {} as LlmEvaluation['dimensions']
  for (const key of Object.keys(ANSWER_DIMENSION_WEIGHTS) as (keyof typeof ANSWER_DIMENSION_WEIGHTS)[]) {
    const value = parsed[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`评测结果缺少维度「${key}」或不是数字：${JSON.stringify(parsed).slice(0, 200)}`)
    }
    dimensions[key] = clampPercent(value)
  }

  const score = Math.round(
    dimensions.content * ANSWER_DIMENSION_WEIGHTS.content +
      dimensions.grammar * ANSWER_DIMENSION_WEIGHTS.grammar +
      dimensions.fluency * ANSWER_DIMENSION_WEIGHTS.fluency +
      dimensions.vocabulary * ANSWER_DIMENSION_WEIGHTS.vocabulary,
  )

  const suggestion =
    typeof parsed.suggestion === 'string' && parsed.suggestion.trim()
      ? parsed.suggestion.trim()
      : '建议先点题回答，再用一个具体例子支撑，结尾总结一句。'

  return { score, dimensions, suggestion, feedback: buildAnswerFeedback(dimensions) }
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0]) as Record<string, unknown>
    } catch {
      return null
    }
  }
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)))
}

/** 四维反馈也由分数与阈值生成，保证「反馈」和「分数」不会互相矛盾 */
function buildAnswerFeedback(dimensions: LlmEvaluation['dimensions']): ScoreFeedback[] {
  const band = (v: number) => v >= 80
  return [
    {
      ok: band(dimensions.content),
      text: band(dimensions.content)
        ? '回答切题完整，观点清晰'
        : '回答略偏离提问重点，建议先直接回应问题再展开',
    },
    {
      ok: band(dimensions.grammar),
      text: band(dimensions.grammar) ? '语法基本准确' : '时态与主谓一致偶有错误，可多留意',
    },
    {
      ok: band(dimensions.fluency),
      text: band(dimensions.fluency) ? '表达流利，少有犹豫' : '停顿较多，多用连接词串联思路',
    },
    {
      ok: band(dimensions.vocabulary),
      text: band(dimensions.vocabulary) ? '措辞丰富，句型多样' : '可尝试使用更丰富的词汇与从句',
    },
  ]
}
