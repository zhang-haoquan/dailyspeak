# DailySpeak

面向「四级水平、求职需要英语交流」的用户，每天用真实职场场景练英语：跟读 + 情境应答两步走，AI 打分 + 遗忘曲线复习，把开口交流练成习惯。

---

## 📌 当前状态（重要，先读这段）

这是一个**正在改造中的工程**，请不要被现在的可运行状态误导：

| | 状态 |
| --- | --- |
| 前端 UI 与交互 | ✅ 已实现，与设计稿（`design/pages/`）对齐 |
| 业务逻辑与算法 | ✅ 已实现（今日任务快照、遗忘曲线排期、词级对齐与发音评分口径） |
| **数据层** | ❌ **仍是 mock**：登录态、内容库、学习进度、复习排期、评分、语音转写全部由 localStorage 与前端模拟逻辑提供 |

也就是说：现在能跑通全流程，但**数据是假的**。

**正在做的事**：按 PRD 08 章实现真实架构（Supabase + NestJS + Prisma + 真实 ASR/LLM 供应商），彻底移除全部 mock。

- 改造范围与排期 → [`docs/TODO.md`](docs/TODO.md)
- 当前阻塞点 → TODO 的 A 区（10 项待确认）与 B 区（凭证未提供）

> 开工前请先看 [`docs/TODO.md`](docs/TODO.md) 的「当前卡点」。

---

## 📚 文档

**所有需求、决策、排期只在 `docs/` 维护**，这里是入口：

| 文档 | 内容 |
| --- | --- |
| [`docs/README.md`](docs/README.md) | 文档地图 + **三条维护硬规则**（新功能必须先写进 PRD） |
| [`docs/prd/PRD.md`](docs/prd/PRD.md) | **需求权威来源**（v0.2） |
| [`docs/prd/archive/`](docs/prd/archive/) | v0.1 原始 PRD 存档（只读） |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | 决策记录，含 11 条已定 + 10 条待确认 |
| [`docs/TODO.md`](docs/TODO.md) | 待办清单（勾选式）+ 排期 + 待确认 |
| [`tools/README.md`](tools/README.md) | 本地验证工具（E2E / 截图）用法 |

**改代码前请先读 `docs/README.md` 的三条规则**，尤其是「新功能先更新 PRD 再动代码」。

---

## 🗂 代码结构

```
dailyspeak/                    npm workspaces monorepo
├─ apps/
│  ├─ web/                     前端（Vite + React + TS + Tailwind v4）
│  │  ├─ src/pages/            P1 登录 · P2 引导 · P3 学习台 · P4 学习/应答/结果 · P5 历史
│  │  ├─ src/components/       ScoreRing / PlaybackButton / TranscriptCard
│  │  ├─ src/hooks/            useAuth · useRecorder · useSpeech · useTranscriber
│  │  ├─ src/services/         ⚠️ 当前为 mock 数据层，P1 S4 / P2 将整体替换
│  │  ├─ src/data/             ⚠️ 硬编码的 10 张种子卡，已入库，待删
│  │  └─ src/styles/           设计 token + Tailwind 主题映射
│  └─ api/                     后端（NestJS 11 + Prisma 7 + Supabase）
│     ├─ prisma/               schema.prisma · migrations · seed.ts
│     ├─ prisma.config.ts      Prisma 7 中心配置（连接串在此）
│     └─ src/
│        ├─ prisma/            PrismaService（pg driver adapter）
│        ├─ review/            遗忘曲线排期（纯函数 + 单测）
│        ├─ health/            健康检查
│        └─ generated/         ⚠️ Prisma 生成物，不入库
├─ packages/shared/            前后端共用类型与常量（唯一来源）
├─ docs/                       需求 / 决策 / 待办（唯一信息源）
├─ design/pages/               7 页高保真设计稿（视觉基准）
├─ supabase/                   本地 Supabase 配置与 migration
└─ tools/                      零依赖 E2E / 截图脚本（CDP 驱动真实浏览器）
```

---

## 🚀 本地运行

### 一次性准备

```bash
npm install
npm run db:up                            # 启动本地 Supabase（Docker，首次拉镜像较慢）
cp apps/api/.env.example apps/api/.env   # 按 npx supabase status 填入本地 Supabase 密钥
cp apps/web/.env.example apps/web/.env   # 填入 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
npm run db:migrate                       # 建表 + 注册触发器
npm run db:seed                          # 写入 10 张场景卡
```

> AI 供应商密钥（DeepSeek、腾讯云）见 `apps/api/.env.example` 的注释，**只填在后端**。
> 本地验证邮件在 Mailpit：<http://127.0.0.1:54324>

### 日常开发

```bash
npm run dev:web             # 前端 http://localhost:5173
npm run dev:api             # 后端 http://localhost:3000/api
```

> `dev:web` 会先构建 `packages/shared`；前端自身直接消费 shared 源码（见决策 D-025）。

### 收工 / 重启

**每天开发结束，请把这三样关掉**（它们会一直占内存，Supabase 一个人就吃 1GB 上下）。
最省事的是一行命令：

```bash
npm run stop                 # 停前后端 + 本地数据库 + 调试用 Chrome
npm run stop -- -IncludeDocker   # 连 Docker Desktop 一起退出
```

脚本是**幂等**的：本来就关着的东西会显示「本来就没在跑」，不会报错。想先看会关哪些、不动手：

```powershell
pwsh tools/stop-all.ps1 -DryRun
```

#### 手工关闭（不想用脚本时）

| 顺序 | 关什么 | 命令 |
| --- | --- | --- |
| 1 | 前后端 dev server | 在跑 `dev:web` / `dev:api` 的终端各按一次 `Ctrl+C` |
| 2 | 本地数据库 | `npm run db:down` |
| 3 | 调试用 Chrome | 直接关窗口（别关你日常用的那个） |
| 4 | Docker Desktop（可选） | 托盘图标 → Quit Docker Desktop，或 `docker desktop stop` |

⚠️ **前端不一定在 5173。** Vite 发现端口被占会自己换，本项目实际多次跑在 **5175**。
找不准端口时按进程杀：

```powershell
Get-NetTCPConnection -LocalPort 5175 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

#### 什么会丢、什么不会丢

| 数据 | 关闭后 |
| --- | --- |
| 本地数据库全部内容（账号、学习记录、今日快照、内容卡） | **保留**。在 Docker 数据卷里，`npm run db:up` 回来就都在 |
| `apps/api/.env`（密钥） | **保留**。在磁盘上，本来就不进版本库 |
| `node_modules` / 构建产物 | 保留 |
| 当次会话的录音回听 | 关页面即失效——音频本来就不落库（[D-017](docs/DECISIONS.md)） |

> ⚠️ **永远不要给 supabase stop 加 `--no-backup`。**
> 那个参数会**连数据卷一起删**：测试账号、学习记录、今日快照全没。
> 内容卡能用 `npm run db:seed` 重新灌，用户数据灌不回来。

> ⚠️ **不要用「按名字杀 node 进程」的方式收工**（比如 `taskkill /IM node.exe /F`）。
> 本项目是 npm workspaces，机器上同时跑着 DeepSeek Harness 自己的 node 进程，
> 一起杀掉会把当前会话弄断。按**端口**杀才安全——`npm run stop` 就是这么做的。

#### 明天的恢复顺序

```bash
npm run db:up        # 1. 起数据库（数据还在，首次会重建容器，约 30 秒）
npm run dev:api      # 2. 后端 http://localhost:3000/api
npm run dev:web      # 3. 前端（看终端输出的实际端口，可能是 5175）
```

`db:up` 之后可以顺手确认数据还在：

```bash
npm run db:status    # 应能列出 API URL / Studio / Mailpit 地址
```

> 想在恢复后立刻确认 AI 供应商还能用（比如怀疑密钥过期）：
> `npm run check:providers`

### 其它脚本

```bash
npm run build               # shared → web → api 全量构建
npm test                    # 单测：后端 112 项 + 前端 15 项
npm run smoke               # API 冒烟测试（鉴权 + 注册登录 + 业务接口，58 项）
npm run auth-ui             # 浏览器端验收（认证 + 前端接真实接口，44 项）
npm run check:providers     # AI 供应商自检：DeepSeek + 腾讯云 ASR（上线前/换密钥后跑）
npm run score-e2e           # 真实第三方端到端评分（需传卡片 id 与两段 WAV，57 项）
npm run learning-e2e        # 真实浏览器录音端到端（需调试 Chrome 喂假麦克风，28 项）
npm run db:studio           # Prisma Studio 看数据
npm run db:status           # 查看本地 Supabase 各服务地址与密钥
npm run stop                # 收工：停前后端 + 数据库 + 调试 Chrome（加 -- -IncludeDocker 连 Docker 一起关）
npm run e2e                 # 学习主链路回归（⚠️ 认证改造后待重写，见 tools/README.md）
```

健康检查：`curl http://localhost:3000/api/health` → `{"ok":true,"db":true,"cards":10}`

## 📌 各阶段状态

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P0 | monorepo + 工具链 + 本地 Supabase | ✅ 完成 |
| P1 S1 | Prisma 建模 + 内容入库 + 遗忘曲线排期 | ✅ 完成 |
| P1 S2 | Supabase Auth + 鉴权守卫 + 画像 + 前端登录 | ✅ 完成 |
| P1 S3 | `today` / `cards/:id` / `history` 接口 + 统一错误与日志 | ✅ 完成 |
| P1 S4 | 前端去 mock（TanStack Query + 删 localStorage 假后端） | ✅ 完成 |
| P2 | ASR（腾讯云）+ LLM（DeepSeek）评分链路 | ✅ 完成 |
| P3 | 内容管道（AI 生成 + 人工抽审） | ⬜ 下一步 |
| P4 | 边界与异常、E2E 重写、上线 | ⬜ |

详见 [`docs/TODO.md`](docs/TODO.md)。

---

## 🔧 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | Vite + React 18 + TypeScript + Tailwind v4 |
| 路由 | react-router-dom v6 |
| 图标 | lucide-react |
| 语音采集 | 浏览器 MediaRecorder / WebRTC |
| 后端 | NestJS 11 + TypeScript 5.9.3 |
| 数据 / 身份 | Supabase（本地 Docker，后续迁云端） |
| ORM | Prisma 7（pg driver adapter） |
| AI | LLM 用 DeepSeek；ASR 供应商待定（→ [D-013](docs/DECISIONS.md#d-013-asr-供应商选型待确认)） |

> 版本栈刻意停在 NestJS 11 / TS 5.9 / Prisma 7.10 而非各自的最新版，
> 原因是最新组合的工具链不兼容（详见 [D-023](docs/DECISIONS.md#d-023-后端技术栈锁定-nestjs-11--typescript-593)）。

设计规范：品牌色 `#3b82f6 → #10b981` 渐变，DM Sans 字体，圆角卡片，浅色主题。设计 token 集中在 `src/styles/tokens.css`，是颜色的唯一来源。
