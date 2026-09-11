/**
 * 后端接口封装（PRD 12 章）
 *
 * 页面不直接拼 URL —— 所有路径、方法、返回类型集中在这里，
 * 接口一旦改了只有这一个文件需要跟。
 * 令牌注入与错误转换在 `http.ts`。
 */
import type {
  CardDetail,
  Domain,
  HistoryStats,
  MeResponse,
  TodayPlanResponse,
  UserProfile,
} from '@dailyspeak/shared'
import { authedFetch } from './http'

export const api = {
  /** 当前用户 + 画像 */
  me: () => authedFetch<MeResponse>('/auth/me'),

  /** 今日任务快照（PRD 5.3）。当天首次调用会生成快照，之后固定不变 */
  today: () => authedFetch<TodayPlanResponse>('/today'),

  /** 学习记录统计（PRD 5.6） */
  history: () => authedFetch<HistoryStats>('/history'),

  /** 卡片详情：内容 + 我的进度 + 我的复习阶段 */
  cardDetail: (cardId: string) => authedFetch<CardDetail>(`/cards/${encodeURIComponent(cardId)}`),

  /** 保存学习计划（PRD 5.2） */
  saveProfile: (domains: Domain[], dailyCount: number) =>
    authedFetch<UserProfile>('/profile', { method: 'PUT', body: { domains, dailyCount } }),
}
