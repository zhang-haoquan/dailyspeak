import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * 前端直接消费 packages/shared 的**源码**，而不是它的 dist 产物。
 *
 * 原因：shared 编译成 CommonJS 给 NestJS 用，而 Rollup 在解析工作区软链包时
 * 不会对 packages/shared/dist 应用 CommonJS 插件（它的路径不含 node_modules），
 * 导致生产构建报「xxx is not exported」。
 * 直接指向源码后，Vite 按 ESM 处理，还能顺带得到 tree-shaking 与改动热更新。
 */
const sharedSrc = fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@dailyspeak/shared': sharedSrc,
    },
  },
  server: {
    host: true,
    port: 5173,
  },
})
