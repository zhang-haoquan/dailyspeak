/**
 * 数据查询 hooks（TanStack Query，见 PRD 08 章工程约定）
 *
 * 统一在这里声明，页面只消费 `{ data, isPending, error, refetch }`，
 * 不再各写一套 `useEffect` + `useState` 的加载态。
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/endpoints'

/** 查询键集中管理，避免各处手写字符串导致缓存键不一致 */
export const queryKeys = {
  today: ['today'] as const,
  history: ['history'] as const,
  card: (cardId: string) => ['card', cardId] as const,
}

/** 今日任务快照（PRD 5.3） */
export function useToday() {
  return useQuery({ queryKey: queryKeys.today, queryFn: api.today })
}

/** 学习记录统计（PRD 5.6） */
export function useHistory() {
  return useQuery({ queryKey: queryKeys.history, queryFn: api.history })
}

/** 卡片详情；cardId 为空时不发请求 */
export function useCardDetail(cardId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.card(cardId ?? ''),
    queryFn: () => api.cardDetail(cardId as string),
    enabled: Boolean(cardId),
  })
}
