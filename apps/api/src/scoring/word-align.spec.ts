/**
 * 词级对齐单测（PRD 6 章）
 *
 * 这个算法原来在前端，Phase 0 踩过一个坑：贪婪替换会把后面的正确词全部带偏，
 * 导致「只漏了开头一个词」被算成 0% 准确度。那条回归必须留在测试里。
 */
import { repeatScoreFromSimilarity } from '@dailyspeak/shared'
import { alignWords, normalizeWord, tokenize } from './word-align'

describe('normalizeWord / tokenize', () => {
  it('小写化并去掉标点', () => {
    expect(normalizeWord('Resume,')).toBe('resume')
    expect(normalizeWord('"walk-through?"')).toBe('walkthrough')
    expect(normalizeWord("don't")).toBe("don't")
  })

  it('切词会丢掉空串（连续空格、纯标点）', () => {
    expect(tokenize('Could   you — walk  me through?')).toEqual([
      'could',
      'you',
      'walk',
      'me',
      'through',
    ])
  })
})

describe('alignWords —— 基本对齐', () => {
  const sentence = 'Could you walk me through your resume'

  it('完全一致：全部 ok，相似度 1', () => {
    const r = alignWords(sentence, 'Could you walk me through your resume')
    expect(r.words.every((w) => w.ok)).toBe(true)
    expect(r.similarity).toBe(1)
    expect(r.total).toBe(7)
    expect(r.matched).toBe(7)
  })

  it('大小写与标点差异不算错', () => {
    const r = alignWords(sentence, 'COULD YOU WALK ME THROUGH YOUR RESUME!')
    expect(r.similarity).toBe(1)
  })

  it('多读的词被忽略，不影响得分', () => {
    const r = alignWords(sentence, 'So could you please walk me through your resume now')
    expect(r.similarity).toBe(1)
  })

  it('少一个词：只标那一个，其余仍然正确', () => {
    const r = alignWords(sentence, 'Could you walk me through your')
    expect(r.matched).toBe(6)
    expect(r.similarity).toBeCloseTo(6 / 7, 5)
    const bad = r.words.filter((w) => !w.ok)
    expect(bad.map((w) => w.word)).toEqual(['resume'])
    expect(bad[0].said).toBeNull()
  })

  it('读成别的词时，标记出「被听成了什么」', () => {
    const r = alignWords('I led the refactoring', 'I lead the refactoring')
    expect(r.similarity).toBeCloseTo(3 / 4, 5)
    const bad = r.words.find((w) => !w.ok)
    expect(bad?.word).toBe('led')
    expect(bad?.said).toBe('lead')
  })
})

describe('alignWords —— 回归：开头漏词不能带偏后续匹配', () => {
  it('原句开头漏一个词，后面的词仍然全部匹配（不能算成 0%）', () => {
    const r = alignWords(
      'Could you walk me through your resume',
      'you walk me through your resume',
    )
    // 6/7 正确，而不是 0/7
    expect(r.matched).toBe(6)
    expect(r.similarity).toBeCloseTo(6 / 7, 5)
    expect(r.words[0].word).toBe('could')
    expect(r.words[0].ok).toBe(false)
    // 不能把转写里的 you 当成 could 的「读成了」
    expect(r.words[0].said).toBeNull()
  })

  it('原句开头漏两个词，剩下的照样全对', () => {
    const r = alignWords(
      'Could you walk me through your resume',
      'walk me through your resume',
    )
    expect(r.matched).toBe(5)
    expect(r.similarity).toBeCloseTo(5 / 7, 5)
  })

  it('重复词场景下替换判定不越界（you ... your）', () => {
    const r = alignWords('you should bring your resume', 'should bring you resume')
    // your 缺失、you 多出来，但整体不应崩到 0
    expect(r.matched).toBeGreaterThanOrEqual(2)
  })

  it('完全无关的内容 → 相似度 0', () => {
    const r = alignWords('Could you walk me through your resume', 'totally different words here')
    expect(r.matched).toBe(0)
    expect(r.similarity).toBe(0)
  })

  it('转写为空 → 全部漏读，相似度 0', () => {
    const r = alignWords('Could you walk me', '')
    expect(r.matched).toBe(0)
    expect(r.words).toHaveLength(4)
    expect(r.words.every((w) => w.said === null)).toBe(true)
  })
})

describe('对齐结果与分数的衔接（D-008：100% 由相似度决定）', () => {
  it('开头漏一个实词只小幅掉分，不会掉到及格线以下', () => {
    const r = alignWords('Could you walk me through your resume', 'you walk me through your resume')
    const score = repeatScoreFromSimilarity(r.similarity)
    // 6/7 ≈ 0.857 → 91 分左右，仍远高于 85 的阈值
    expect(score).toBeGreaterThanOrEqual(88)
    expect(score).toBeLessThan(95)
  })

  it('全对得分接近上限', () => {
    const r = alignWords('Could you walk me', 'Could you walk me')
    expect(repeatScoreFromSimilarity(r.similarity)).toBe(98)
  })

  it('完全没对上得分落到下限附近', () => {
    const r = alignWords('Could you walk me', 'nothing matches at all')
    expect(repeatScoreFromSimilarity(r.similarity)).toBe(52)
  })
})
