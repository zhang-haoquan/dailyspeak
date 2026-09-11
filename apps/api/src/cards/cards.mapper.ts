import type { Difficulty, Domain, ScenarioCard } from '@dailyspeak/shared'
import type { ScenarioCard as ScenarioCardRow } from '../generated/prisma/client'

/**
 * 内容行 → 接口返回体。
 *
 * 出口统一在这里收口，保证：
 * - 不把 `status` / `createdAt` 这类审核字段漏给学员端；
 * - `referenceAnswer` 为空时**不下发该字段**（而不是下发 null），
 *   前端用 `card.referenceAnswer ?` 判断即可。
 */
export function toScenarioCard(row: ScenarioCardRow): ScenarioCard {
  return {
    id: row.id,
    domain: row.domain as Domain,
    sceneText: row.sceneText,
    sceneZh: row.sceneZh,
    sentence: row.sentence,
    translation: row.translation,
    prompt: row.prompt,
    promptZh: row.promptZh,
    ...(row.referenceAnswer ? { referenceAnswer: row.referenceAnswer } : {}),
    difficulty: row.difficulty as Difficulty,
    tag: row.tag,
  }
}
