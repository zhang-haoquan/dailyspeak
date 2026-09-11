# 待办清单

> **规则**
> 1. 每完成一项，把 `[ ]` 改成 `[x]`，并在行尾补上完成日期。
> 2. **新增需求先更新 [`prd/PRD.md`](./prd/PRD.md)，再来这里登记**；口径类的新增同时记入 [`DECISIONS.md`](./DECISIONS.md)。
> 3. 涉及决策的条目，行尾用 `→ D-xxx` 指向决策记录。
> 4. 优先级：`P0` 准备 → `P1` 后端基础 → `P2` 评分链路 → `P3` 内容管道 → `P4` 边界与测试。

## 当前状态

**P1 已开工。** 所有开工前的阻塞项已清空：

| 项 | 结论 |
| --- | --- |
| 目录结构 | monorepo（`apps/web` + `apps/api` + `packages/shared`）→ [D-014](./DECISIONS.md#d-014-仓库结构采用-monorepo) |
| 数据库 / 认证 | 本地 Supabase（Docker），后续迁云端 → [D-022](./DECISIONS.md#d-022-数据库与认证先用本地-supabase) |
| 认证范围 | 只做邮箱 + 密码 → [D-015](./DECISIONS.md#d-015-认证范围只做邮箱--密码) |
| 邮箱验证 | 走本地 Inbucket，保持开启 → D-022 |
| Git 基线 | 已建立并推送 GitHub 私有仓库（`b98bca3`）→ [D-021](./DECISIONS.md#d-021-版本控制基线已建立) |
| LLM 供应商 | DeepSeek → [D-012](./DECISIONS.md#d-012-llm-供应商选定-deepseek) |

**唯一待你决策的**：ASR 供应商（A-2）。**它不阻塞 P1**，但 P2 开工前必须定。

---

## A. 待你确认

- [x] **A-1** LLM 供应商选型 → **DeepSeek** ｜ 2026-09-11 → [D-012](./DECISIONS.md#d-012-llm-供应商选定-deepseek)
- [ ] 🔴 **A-2** **ASR 供应商选型（P2 前必须定）** → [D-013](./DECISIONS.md#d-013-asr-供应商选型待确认)
      ⚠️ DeepSeek 无任何音频接口，ASR 必须独立选供应商。
      建议 **A+B 双实现**：开发测试用本地 Whisper 容器（免费、可离线、e2e 可复现），生产切通义 Paraformer。
- [x] **A-3** 仓库目录结构 → **monorepo A 方案**，接受搬迁 ｜ 2026-09-11 → [D-014](./DECISIONS.md#d-014-仓库结构采用-monorepo)
- [x] **A-4** 认证范围 → **只做邮箱 + 密码** ｜ 2026-09-11 → [D-015](./DECISIONS.md#d-015-认证范围只做邮箱--密码)
- [ ] 🟡 **A-5** 参考音频方案：浏览器 TTS vs 服务端 TTS 预生成（**P3 前定**，DeepSeek 无 TTS）→ [D-016](./DECISIONS.md#d-016-参考音频方案待确认)
- [ ] 🟡 **A-6** 用户录音是否落库 Supabase Storage（**P2 前定**）→ [D-017](./DECISIONS.md#d-017-音频是否落库待确认)
- [ ] 🟡 **A-7** 内容生成管道排期：本轮做还是放 P3 → [D-018](./DECISIONS.md#d-018-内容生成管道排期待确认)
- [ ] 🟡 **A-8** 离线缓存是否本轮做 → [D-019](./DECISIONS.md#d-019-离线缓存排期待确认)
- [x] **A-9** 部署形态 → 已说明清楚，**不阻塞 P1**，先按 localhost 配置；有上线计划时在 P2 结束前告知域名 ｜ 2026-09-11 → [D-020](./DECISIONS.md#d-020-部署形态待确认)
- [x] **A-10** 是否先建 Git 基线 → **已完成**（GitHub 私有仓库）｜ 2026-09-11 → [D-021](./DECISIONS.md#d-021-版本控制基线已建立)
- [ ] 🟡 **A-11** 首发上线卡片数量目标（建议每领域 ≥ 20 张，**P3 前定**）→ 关联 [D-018](./DECISIONS.md#d-018-内容生成管道排期待确认)
- [x] **A-12** 金融 / 汽车制造领域处理 → **按推荐**：P1 从 Onboarding 下掉这两个空领域，同时后端实现跨领域补齐兜底 ｜ 2026-09-11

---

## B. 需要你提供的凭证

- [x] ~~**B-1** Supabase 云端凭证~~ → **走本地 Supabase，无需提供** ｜ 2026-09-11 → [D-022](./DECISIONS.md#d-022-数据库与认证先用本地-supabase)
- [ ] 🔵 **B-2** DeepSeek API Key（`DEEPSEEK_API_KEY`）—— **P2 开工前提供即可**，P1 不需要
- [ ] 🔴 **B-3** ASR 服务凭证 —— 取决于 A-2 的结论；若选本地 Whisper 则**无需凭证**
- [ ] ⚪ **B-4** 邮件发送（仅上线时需要；本地用 Inbucket，不需要）
- [x] ~~**B-5** 短信服务商~~ → **已否决**（只做邮箱）｜ 2026-09-11

---

## C. P0 准备

- [x] `git init` + 基线提交并推送 GitHub 私有仓库 ｜ 2026-09-11
- [x] 确认工具链：Node v24.11.1 / npm 11.6.2 / Docker Desktop ｜ 2026-09-11
- [x] 建立 npm workspaces monorepo：`apps/web` + `apps/api` + `packages/shared`，搬迁现有前端 → D-014 ｜ 2026-09-11
- [x] 根 `package.json` 编排脚本（`dev:web` / `dev:api` / `build` / `test` / `db:*`）｜ 2026-09-11
- [x] 搬迁后校验：前端 `build` 通过、视觉无回归（14 张截图复验）｜ 2026-09-11
- [x] `packages/shared`：前后端共用类型与常量 ｜ 2026-09-11
- [x] 后端骨架：NestJS 11 + TS 5.9.3（版本栈锁定见 D-023）｜ 2026-09-11
- [x] 本地 Supabase：`supabase init` + `start`（API `:54321`、DB `:54322`、Studio `:54323`、Mailpit `:54324`）→ D-022 ｜ 2026-09-11
- [x] Prisma 7 接入：`prisma.config.ts` + driver adapter，`DATABASE_URL` 指向本地 Supabase → D-024 ｜ 2026-09-11
- [x] 环境变量管理：`.env` 已被 gitignore，`.env.example` 说明每个变量来源 ｜ 2026-09-11

> **技术选型（我已定，有异议请说）**：前端数据获取用 TanStack Query；后端校验用 class-validator + class-transformer；API 前缀 `/api`，统一错误格式 `{ code, message, details? }`；开发期 Prisma 用 `migrate dev` 且 migration 文件入库。

---

## D. P1 后端基础

分 4 个可独立验收的小步，每步跑通再进下一步。

### S1 地基 ✅ 已完成（2026-09-11）

- [x] Prisma schema：`user_profiles` / `scenario_cards` / `user_progress` / `review_schedule` / `today_plan` → [PRD 07 章](./prd/PRD.md#07-数据模型)
- [x] 落地 PRD 07 章 `[v0.2]` 约束：`user_progress` 唯一键 `(user_id, card_id)`、`review_schedule` 唯一键与 `(user_id, due_at)` 索引、`today_plan` 唯一键 `(user_id, date_key)`
- [x] 首次 migration（`20260911041047_init`）
- [x] seed 脚本：10 张场景卡入库（计算机/IT 4 张、职场通用 6 张），`status = published`
- [x] `ReviewService`：遗忘曲线算法迁到后端（纯函数）→ D-006
- [x] `ReviewService` 单测：**13 项全绿**（阶段间隔、分数回退、封顶 S6、触底 S1、阈值边界 85/84、到期判定、跨月跨年）
- [x] **验收通过**：`/api/health` 返回 `{ok:true, db:true, cards:10}`；单测 13/13

### S2 认证

- [ ] Supabase Auth 集成（邮箱 + 密码注册 / 登录 / 登出 / session 刷新）→ D-015
- [ ] `JwtGuard` + `@CurrentUser()` 装饰器，保护所有业务接口
- [ ] 注册后自动初始化 `user_profiles`（`onboarded = false`）
- [ ] 邮箱验证保持开启，验证邮件经 Mailpit 接收 → D-022
- [ ] **验收**：能真注册、真登录、真登出，刷新后登录态保持

### S3 业务接口

- [ ] `GET /api/profile`、`PUT /api/profile`（领域 1–3 个 + 每日条数 1–10，边界截断）→ [PRD 5.2](./prd/PRD.md#52-首次引导选领域--定学习计划p2)
- [ ] `GET /api/cards/:id`
- [ ] `GET /api/today`：今日任务快照（首次进入当天生成并落库；跟读未完成的卡优先补回；排除已到期复习卡；**跨领域补齐兜底**）→ D-004、A-12
- [ ] `GET /api/history`：连续天数、本月/累计卡片、本周趋势（**日期口径统一走本地日期，不用 UTC 字符串前缀比较**）
- [ ] 统一响应/错误格式 + 全局异常过滤器 + 请求日志
- [ ] CORS 配置（本地前端源）
- [ ] **验收**：curl / Postman 全通；`today` 快照当天固定不变

### S4 前端去 mock

- [ ] 新增 http 层：fetch 封装、注入 Authorization、401 刷新、超时与重试
- [ ] 重写 `useAuth`：接 Supabase session，**同时删掉明文密码存储**
- [ ] `Login.tsx`：接真实注册/登录，删除 `setTimeout` 假延迟
- [ ] `Onboarding.tsx` → `PUT /api/profile`；**下掉金融 / 汽车制造两个空领域** → A-12
- [ ] `Dashboard.tsx` → `GET /api/today` + 骨架屏
- [ ] `History.tsx` → `GET /api/history`
- [ ] 全局补齐**加载态 / 空态 / 错误态**（现在一个都没有）
- [ ] 删除 `services/storage.ts`、`services/api.ts`（localStorage 假后端）
- [ ] 删除 `data/cards.ts`（硬编码 10 张种子卡）
- [ ] **验收**：浏览器跑通「登录 → 选领域 → 看到今日卡 → 历史」；localStorage 里**不再有任何 `dailyspeak:` 数据**

---

## E. P2 评分链路

### 后端

- [ ] `AsrProvider` 接口 + 本地 Whisper 实现（开发/测试）→ A-2
- [ ] `AsrProvider` + 云端实现（通义 Paraformer，生产）→ A-2
- [ ] `LlmProvider` 接口 + DeepSeek 实现（OpenAI 兼容，`base_url = https://api.deepseek.com`）→ D-012
- [ ] 音频上传接口：multipart、**时长/格式/大小校验**（跟读 3–15s、应答 30–60s）→ [PRD 09](./prd/PRD.md#09-边界与异常处理)
- [ ] 词级对齐算法下沉后端（归一化 → LCS 对齐 → 相似度），含单测
      - [ ] 覆盖「开头漏词不会带偏后续匹配」这条回归
- [ ] `POST /api/score/repeat`：ASR → 词级比对 → 分数/反馈/`transcript`/`transcriptSource`/`alignment`/`similarity` → D-008、D-009
- [ ] `POST /api/score/answer`：ASR → DeepSeek 四维评测（内容 40 / 语法 25 / 流利度 20 / 措辞 15）
- [ ] 第三方超时/失败的**重试 3 次 + 降级**（降级为「仅记完成、不打分」）→ [PRD 09](./prd/PRD.md#09-边界与异常处理)
- [ ] 提交幂等：同一 `(user_id, card_id)` 以最后一次有效提交为准 → D-006
- [ ] 打分成功后写入 `user_progress`，整卡完成时推进 `review_schedule`

### 前端

- [ ] `Learning.tsx`：录音 → `FormData` 上传 → 展示服务端返回的分数/反馈/转写/逐词对照
- [ ] `Answer.tsx`：同上
- [ ] `Result.tsx`：分数与反馈来自服务端
- [ ] `TranscriptCard.tsx`：去掉「模拟转写（演示）」徽章，改为显示真实 ASR 供应商
- [ ] 删除 `services/scoring.ts`（假打分）、`services/asr.ts`（模拟转写与错词表）、`hooks/useTranscriber.ts`
- [ ] `useRecorder.ts`：保留（MediaRecorder 采集是真实能力），补上传与失败处理
- [ ] 录音失败/权限拒绝的**文本输入兜底** → [PRD 09](./prd/PRD.md#09-边界与异常处理)

---

## F. P3 内容管道

- [ ] `scenario_cards` 状态机：`draft` → `review` → `published`，只有 `published` 参与调度
- [ ] DeepSeek 批量生成候选：prompt 模板 + 批量任务 + 结果落 `draft`
- [ ] 人工抽审接口：待审列表 / 通过 / 驳回 / 编辑
- [ ] 补齐首发内容量至目标（依 A-11），覆盖计算机 / IT 与职场通用
- [ ] 处理金融 / 汽车制造内容（或确认继续下掉）
- [ ] 参考音频生成（仅当 A-5 选服务端 TTS）

---

## G. P4 边界与测试

- [ ] 内容某领域无卡可推时跨领域补齐 + 后台告警 → [PRD 09](./prd/PRD.md#09-边界与异常处理)
- [ ] 离线缓存与联网补交（仅当 A-8 确定本轮做）
- [ ] 历史页区分展示「已完成、未打分」的降级记录（不得伪造分数）
- [ ] 后端单测：排期算法、词级比对、评分映射、provider 错误/超时/降级分支
- [ ] E2E 重写：现有 `tools/e2e.mjs` 的 73 项断言**大部分依赖 localStorage 注入造数，会失效**，需改为后端 seed + 真实 API 驱动
- [ ] 按 PRD 09 章补 Playwright 主链路用例（登录 → 选领域 → 学一张卡 → 打分 → 入复习队列）

---

## H. 已完成

### 文档基建
- [x] 2026-09-11 建立 `docs/` 文档结构：PRD 权威版 + 决策记录 + 待办清单
- [x] 2026-09-11 原始 PRD HTML 存档至 `docs/prd/archive/`
- [x] 2026-09-11 PRD 升级 v0.2：补充录音回听、转写回显、跟读算法写实、接口返回契约
- [x] 2026-09-11 锁定 P1 开工前决策：D-012 / D-014 / D-015 / D-021 / D-022

### P1 S1（地基）
- [x] 2026-09-11 monorepo 落地：`apps/web` + `apps/api` + `packages/shared`（npm workspaces）
- [x] 2026-09-11 `packages/shared`：领域 / 用户 / 学习 / 评测契约 / 接口契约 / 日期工具
- [x] 2026-09-11 后端骨架：NestJS 11 + Prisma 7 + 健康检查接口
- [x] 2026-09-11 本地 Supabase 起栈（Postgres + Auth + Studio + Mailpit）
- [x] 2026-09-11 5 张表 migration + 10 张场景卡 seed
- [x] 2026-09-11 遗忘曲线排期迁后端，13 项单测全绿
- [x] 2026-09-11 锁定版本栈：NestJS 11.2.3 + TS 5.9.3 + Prisma 7.10.0（避开 latest 的 RC 与不兼容组合）→ D-023 / D-024

### 样式与登录（→ D-001 / D-002 / D-003）
- [x] 2026-09-11 修复登录页 UI 错乱：根因是**工程从未安装 Tailwind**，补齐 v4 接入
- [x] 2026-09-11 登录/注册页：字段级内联校验、密码可见性切换、图标语义修正
- [x] 2026-09-11 密码强度规则与 PRD 对齐（≥ 8 位，含大小写字母与数字）

### 学习主链路逻辑（→ D-004 / D-005 / D-006）
- [x] 2026-09-11 今日任务改为当天快照，修复进度 `1/3 → 1/4` 跳变
- [x] 2026-09-11 修复「只完成跟读的卡永久丢失」
- [x] 2026-09-11 修复新句与复习重复推同一张卡
- [x] 2026-09-11 完成口径改为「跟读 + 应答都完成」
- [x] 2026-09-11 修复复习卡一次连跳两个遗忘曲线阶段
- [x] 2026-09-11 修复历史页周趋势图日期区间错误（永远不含今天）
- [x] 2026-09-11 本月卡片统计改为本地日期口径，避免跨时区算错

### 回听与转写（→ D-007 / D-008 / D-009）
- [x] 2026-09-11 新增录音回听：学习页、应答页、结果页（含跨路由交接）
- [x] 2026-09-11 跟读评分改为由词级相似度驱动，反馈具体到词
- [x] 2026-09-11 修复词级对齐的贪婪替换 bug（曾把准确度算成 0%）
- [x] 2026-09-11 新增「我听到的」转写回显 + 逐词对照 + 词级准确度

### 验证工具
- [x] 2026-09-11 `tools/e2e.mjs`：73 项断言（含 ASR 纯函数单测），全绿
- [x] 2026-09-11 `tools/shots.mjs`：14 张页面截图
- [x] 2026-09-11 `tools/README.md`：工具用法与踩坑记录

> ⚠️ 上述「已完成」中，凡涉及**数据来源**的部分（登录态、内容库、进度、排期、评分、转写）将在 P1/P2 被真实实现替换；已完成的是**交互逻辑与算法**，不是数据层。
