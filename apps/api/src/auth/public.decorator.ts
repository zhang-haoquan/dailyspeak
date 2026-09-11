import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'dailyspeak:isPublic'

/**
 * 标记接口无需登录。
 * 全局默认开启鉴权（APP_GUARD），需要放行的接口显式加上 @Public()。
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
