import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './http'

/**
 * 全局查询客户端。
 *
 * - **只对 5xx / 网络异常重试一次**。4xx 是请求本身有问题（参数错、没权限、
 *   卡片不存在），重试一次结果一样，纯属浪费往返——而且会让「404 页面」多转一圈才出提示。
 * - `refetchOnWindowFocus: false`：切回标签页时静默重取会在用户刚做完动作时
 *   突然刷新序号/进度，反而显得数据"跳"。需要新数据时靠重新挂载与手动重试。
 * - `staleTime: 0`：默认每次挂载都校验一次。TanStack 会在**保留旧数据**的同时后台刷新，
 *   所以不会出现 loading 闪烁。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
        return failureCount < 1
      },
      refetchOnWindowFocus: false,
      staleTime: 0,
    },
  },
})
