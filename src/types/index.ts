/** 领域（首发：计算机/IT + 职场通用） */
export type Domain = '计算机/IT' | '职场通用' | '金融' | '汽车制造'

export const DOMAINS: Domain[] = ['计算机/IT', '职场通用', '金融', '汽车制造']

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
  difficulty: 1 | 2 | 3
  /** 标签：如「面试高频句」 */
  tag: string
}

/** 用户 */
export interface User {
  id: string
  account: string
  password: string
  createdAt: string
}

/** 用户画像（个性化设置） */
export interface UserProfile {
  userId: string
  domains: Domain[]
  dailyCount: number
  onboarded: boolean
  createdAt: string
}

/** 学习进度（每张卡的跟读/应答/综合分） */
export interface CardProgress {
  userId: string
  cardId: string
  repeatScore: number | null
  answerScore: number | null
  composite: number | null
  doneAt: string
  mode: 'new' | 'review'
}

/** 复习排期（遗忘曲线） */
export interface ReviewItem {
  userId: string
  cardId: string
  stage: number
  dueAt: string
  lastScore: number
  timesReviewed: number
}

/** 词级比对结果（跟读：原句 vs ASR 转写） */
export interface WordDiff {
  /** 原句里的词 */
  word: string
  /** 识别到的对应词；null 表示没识别到 */
  said: string | null
  ok: boolean
}

/** 跟读打分结果 */
export interface RepeatScore {
  score: number
  feedback: { ok: boolean; text: string }[]
  /** ASR 转写文本（「我听到的」）；没有转写时为 undefined */
  transcript?: string
  /** 转写来源：browser=浏览器真实识别，mock=本地模拟（演示用） */
  transcriptSource?: 'browser' | 'mock'
  /** 词级对齐，用于在学习页逐词对照原句 */
  alignment?: WordDiff[]
  /** 词级相似度 0–1 */
  similarity?: number
}

/** 应答打分结果 */
export interface AnswerScore {
  score: number
  dimensions: {
    content: number
    grammar: number
    fluency: number
    vocabulary: number
  }
  feedback: { ok: boolean; text: string }[]
  suggestion: string
  transcript?: string
}

/** 今日任务卡（展示在 Dashboard） */
export interface TodayCard {
  card: ScenarioCard
  type: 'new' | 'review'
  stage?: number
  repeatDone: boolean
  answerDone: boolean
  lastScore?: number
}

/** 模拟打分时延迟的选项 */
export type ScoreKind = 'repeat' | 'answer'
