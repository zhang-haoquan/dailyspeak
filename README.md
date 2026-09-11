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
dailyspeak/
├─ docs/              需求 / 决策 / 待办（唯一信息源）
├─ design/pages/      7 页高保真设计稿（HTML，视觉基准）
├─ src/               前端（Vite + React + TS + Tailwind v4）
│  ├─ pages/          P1 登录 · P2 引导 · P3 学习台 · P4 学习/应答/结果 · P5 历史
│  ├─ components/     ScoreRing / PlaybackButton / TranscriptCard
│  ├─ hooks/          useAuth · useRecorder · useSpeech · useTranscriber
│  ├─ services/       ⚠️ 当前为 mock 数据层，P1/P2 将整体替换
│  └─ styles/         设计 token + Tailwind 主题映射
├─ tools/             零依赖 E2E / 截图脚本（CDP 驱动真实浏览器）
└─ public/
```

> 后端（NestJS）尚未创建，见 [`docs/TODO.md`](docs/TODO.md) 的 P1。

---

## 🚀 本地运行

```bash
npm install
npm run dev          # http://localhost:5173
```

其它脚本：

```bash
npm run build        # 类型检查 + 生产构建
npm run preview      # 预览构建产物
npm run e2e          # 端到端回归（需先启动带调试端口的 Chrome，见 tools/README.md）
npm run shots        # 逐页截图到 shots/
```

---

## 🔧 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | Vite + React 18 + TypeScript + Tailwind v4 |
| 路由 | react-router-dom v6 |
| 图标 | lucide-react |
| 语音采集 | 浏览器 MediaRecorder / WebRTC |
| 后端 | NestJS + TypeScript（**待建**） |
| 数据 / 身份 | Supabase Auth + Postgres + Prisma（**待接**） |
| AI | 通义千问 / 豆包（ASR + LLM，**待接**） |

设计规范：品牌色 `#3b82f6 → #10b981` 渐变，DM Sans 字体，圆角卡片，浅色主题。设计 token 集中在 `src/styles/tokens.css`，是颜色的唯一来源。
