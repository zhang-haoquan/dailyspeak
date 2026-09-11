/**
 * 评测结果解析与反馈生成单测
 *
 * 重点是「模型返回不干净时不能让脏数据变成分数」：
 * 缺维度、非数字、空正文都必须抛错触发重试，而不是默认成 0 分落库。
 */
import { ANSWER_DIMENSION_WEIGHTS } from '@dailyspeak/shared'
import {
  buildEvaluatorUserPrompt,
  buildRepeatFeedback,
  parseEvaluation,
} from './scoring.service'
import { alignWords } from './word-align'

const GOOD = '{"content":70,"grammar":55,"fluency":60,"vocabulary":60,"suggestion":"补充具体细节。"}'

describe('parseEvaluation', () => {
  it('解析标准 JSON 并按权重算综合分', () => {
    const r = parseEvaluation(GOOD)
    expect(r.dimensions).toEqual({ content: 70, grammar: 55, fluency: 60, vocabulary: 60 })
    // 70*0.4 + 55*0.25 + 60*0.2 + 60*0.15 = 28 + 13.75 + 12 + 9 = 62.75 → 63
    expect(r.score).toBe(63)
    expect(r.suggestion).toBe('补充具体细节。')
  })

  it('权重口径与 shared 一致（改一处两边同时生效）', () => {
    expect(ANSWER_DIMENSION_WEIGHTS.content).toBe(0.4)
    expect(ANSWER_DIMENSION_WEIGHTS.grammar).toBe(0.25)
    expect(ANSWER_DIMENSION_WEIGHTS.fluency).toBe(0.2)
    expect(ANSWER_DIMENSION_WEIGHTS.vocabulary).toBe(0.15)
  })

  it('容忍 markdown 围栏', () => {
    expect(parseEvaluation('```json\n' + GOOD + '\n```').score).toBe(63)
  })

  it('容忍前后多余的说明文字', () => {
    expect(parseEvaluation('Here is the result:\n' + GOOD + '\nHope it helps.').score).toBe(63)
  })

  it('超出 0-100 的分数被夹逼', () => {
    const r = parseEvaluation(
      '{"content":150,"grammar":-20,"fluency":60,"vocabulary":60,"suggestion":"x"}',
    )
    expect(r.dimensions.content).toBe(100)
    expect(r.dimensions.grammar).toBe(0)
  })

  it('小数被取整', () => {
    const r = parseEvaluation(
      '{"content":70.6,"grammar":55.4,"fluency":60,"vocabulary":60,"suggestion":"x"}',
    )
    expect(r.dimensions.content).toBe(71)
    expect(r.dimensions.grammar).toBe(55)
  })

  it('缺维度 → 抛错（触发重试，而不是默认 0 分）', () => {
    expect(() => parseEvaluation('{"content":70,"grammar":55,"fluency":60,"suggestion":"x"}')).toThrow(
      /缺少维度「vocabulary」/,
    )
  })

  it('维度不是数字 → 抛错', () => {
    expect(() =>
      parseEvaluation('{"content":"70","grammar":55,"fluency":60,"vocabulary":60,"suggestion":"x"}'),
    ).toThrow(/不是数字/)
  })

  it('完全不是 JSON → 抛错', () => {
    expect(() => parseEvaluation('抱歉，我无法评测')).toThrow(/无法解析评测结果/)
  })

  it('建议缺失时给一条兜底建议，但分数照常', () => {
    const r = parseEvaluation('{"content":70,"grammar":55,"fluency":60,"vocabulary":60}')
    expect(r.score).toBe(63)
    expect(r.suggestion.length).toBeGreaterThan(0)
  })

  it('反馈由分数生成，与分数不矛盾', () => {
    const low = parseEvaluation('{"content":40,"grammar":40,"fluency":40,"vocabulary":40,"suggestion":"x"}')
    expect(low.feedback.every((f) => !f.ok)).toBe(true)
    const high = parseEvaluation('{"content":90,"grammar":90,"fluency":90,"vocabulary":90,"suggestion":"x"}')
    expect(high.feedback.every((f) => f.ok)).toBe(true)
  })
})

describe('buildEvaluatorUserPrompt', () => {
  it('带上提问与转写', () => {
    const p = buildEvaluatorUserPrompt('Why this role?', null, 'because I like it')
    expect(p).toContain('Why this role?')
    expect(p).toContain('because I like it')
    expect(p).not.toContain('model answer')
  })

  it('有参考答案时带进来，并说明不要求逐字一致', () => {
    const p = buildEvaluatorUserPrompt('Why this role?', 'Because of the mission.', 'because I like it')
    expect(p).toContain('Because of the mission.')
    expect(p).toContain('do not require the candidate to match it')
  })
})

describe('buildRepeatFeedback —— 反馈必须来自词级 diff（PRD 6 章）', () => {
  const sentence = 'Could you walk me through your resume'

  it('全对时说「每个词都识别正确」', () => {
    const align = alignWords(sentence, sentence)
    const fb = buildRepeatFeedback(98, align, sentence)
    expect(fb[0].ok).toBe(true)
    expect(fb[0].text).toContain('每个词都识别正确')
    expect(fb.every((f) => f.ok)).toBe(true)
  })

  it('读错词时点名道姓给出「原词 → 被听成」', () => {
    const align = alignWords('I led the refactoring', 'I lead the refactoring')
    const fb = buildRepeatFeedback(80, align, 'I led the refactoring')
    const replaced = fb.find((f) => f.text.includes('被听成了别的词'))
    expect(replaced?.ok).toBe(false)
    expect(replaced?.text).toContain('led → lead')
  })

  it('漏词时列出漏掉的词', () => {
    const align = alignWords(sentence, 'Could you walk me through your')
    const fb = buildRepeatFeedback(70, align, sentence)
    const missing = fb.find((f) => f.text.includes('没有识别到'))
    expect(missing?.text).toContain('resume')
  })

  it('低分时给出可执行的建议而不是空话', () => {
    const align = alignWords(sentence, 'nothing matches')
    const fb = buildRepeatFeedback(52, align, sentence)
    expect(fb.some((f) => f.text.includes('逐词跟读'))).toBe(true)
  })

  it('反馈条数与命中情况相关，不会永远给同一套', () => {
    const perfect = buildRepeatFeedback(98, alignWords(sentence, sentence), sentence)
    const poor = buildRepeatFeedback(52, alignWords(sentence, 'x y'), sentence)
    expect(perfect.length).not.toBe(poor.length)
  })
})
