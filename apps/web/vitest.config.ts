import { defineConfig } from 'vitest/config'

/**
 * 前端单测配置：被测的是 wav 编解码这类**纯函数**，
 * 不碰 DOM/React，所以用 node 环境跑，不引 jsdom（省依赖也更快）。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
})
