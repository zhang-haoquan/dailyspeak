/**
 * 领域与内容库（PRD 03 / 07 章）
 *
 * 首发只启用「计算机/IT」与「职场通用」两个领域。
 * 「金融」「汽车制造」暂时没有内容，Phase 1 先从首次引导里下掉，
 * 待内容管道补齐后重新开放（见 docs/TODO.md A-12）。
 */

export type Domain = '计算机/IT' | '职场通用' | '金融' | '汽车制造'

/** 全部领域（数据库取值域） */
export const ALL_DOMAINS: readonly Domain[] = [
  '计算机/IT',
  '职场通用',
  '金融',
  '汽车制造',
] as const

/** 当前有内容、允许用户选择的领域（PRD 首发范围） */
export const AVAILABLE_DOMAINS: readonly Domain[] = ['计算机/IT', '职场通用'] as const

/** 内容审核状态机（PRD 07 章：AI 生成候选 + 人工抽审上线） */
export type CardStatus = 'draft' | 'review' | 'published' | 'archived'

/** 难度 1–3 */
export type Difficulty = 1 | 2 | 3

/** 场景卡（内容库） */
export interface ScenarioCard {
  id: string
  domain: Domain
  /** 场景标题，如「Resume walkthrough」 */
  sceneText: string
  /** 场景中文说明 */
  sceneZh: string
  /** 跟读原句（英文） */
  sentence: string
  /** 跟读原句（中文） */
  translation: string
  /** 情境应答面试官提问（英文） */
  prompt: string
  /** 提问中文 */
  promptZh: string
  /** 参考答案（可选，用于提示） */
  referenceAnswer?: string
  difficulty: Difficulty
  /** 标签：如「面试高频句」 */
  tag: string
}

/** 内容库里的完整记录（含审核状态与时间戳） */
export interface ScenarioCardRecord extends ScenarioCard {
  status: CardStatus
  createdAt: string
  updatedAt: string
}
