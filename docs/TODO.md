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
- [x] **A-2** ASR 供应商选型 → **腾讯云语音识别**（一句话识别 `SentenceRecognition`）｜ 2026-09-11 → [D-013](./DECISIONS.md#d-013-asr-供应商选定腾讯云语音识别)
- [x] **A-3** 仓库目录结构 → **monorepo A 方案**，接受搬迁 ｜ 2026-09-11 → [D-014](./DECISIONS.md#d-014-仓库结构采用-monorepo)
- [x] **A-4** 认证范围 → **只做邮箱 + 密码** ｜ 2026-09-11 → [D-015](./DECISIONS.md#d-015-认证范围只做邮箱--密码)
- [ ] 🟡 **A-5** 参考音频方案：浏览器 TTS vs 服务端 TTS 预生成（**P3 前定**，DeepSeek 无 TTS）→ [D-016](./DECISIONS.md#d-016-参考音频方案待确认)
- [ ] 🟡 **A-6** 用户录音是否落库 Supabase Storage（**P2 前定**）→ [D-017](./DECISIONS.md#d-017-音频是否落库待确认)
- [ ] 🟡 **A-7** 内容生成管道排期：本轮做还是放 P3 → [D-018](./DECISIONS.md#d-018-内容生成管道排期待确认)
- [ ] 🟡 **A-8** 离线缓存是否本轮做 → [D-019](./DECISIONS.md#d-019-离线缓存排期待确认)
- [x] **A-9** 部署形态 → **自有服务器**：前端 + 后端都部署在该服务器，数据库用 Supabase 云端 ｜ 2026-09-11 → [D-020](./DECISIONS.md#d-020-部署形态自有服务器--云端-supabase)
- [x] **A-10** 是否先建 Git 基线 → **已完成**（GitHub 私有仓库）｜ 2026-09-11 → [D-021](./DECISIONS.md#d-021-版本控制基线已建立)
- [ ] 🟡 **A-11** 首发上线卡片数量目标（建议每领域 ≥ 20 张，**P3 前定**）→ 关联 [D-018](./DECISIONS.md#d-018-内容生成管道排期待确认)
- [x] **A-12** 金融 / 汽车制造领域处理 → **按推荐**：P1 从 Onboarding 下掉这两个空领域，同时后端实现跨领域补齐兜底 ｜ 2026-09-11
- [ ] 🟡 **A-13** 确认腾讯云「**一句话识别**」是否也在免费额度内（你提到的额度页列的是「录音文件识别」与「实时语音识别」，是不同子产品）。若额度只覆盖录音文件识别，需改用异步 `CreateRecTask` + 轮询 → [D-013](./DECISIONS.md#d-013-asr-供应商选定腾讯云语音识别)

---

## B. 需要你提供的凭证

- [x] ~~**B-1** Supabase 云端凭证~~ → 本地开发阶段无需提供（上线时再给）｜ 2026-09-11 → [D-022](./DECISIONS.md#d-022-数据库与认证先用本地-supabase)
- [ ] 🔵 **B-2** DeepSeek API Key → `apps/api/.env` 的 `DEEPSEEK_API_KEY`（**P2 开工前提供**）
- [ ] 🔴 **B-3** 腾讯云 API 密钥 → `apps/api/.env` 的 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`（**P2 开工前提供**）
      ⚠️ 是「访问密钥 → API 密钥管理」里的 **SecretId / SecretKey**，不是 AppID
- [ ] 🔵 **B-4** 上线时：服务器域名 / SSH 信息、Supabase 云端密钥、邮件发送配置
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

### S2 认证 ✅ 已完成（2026-09-11）

- [x] Supabase Auth 集成（邮箱 + 密码注册 / 登录 / 登出 / session 刷新）→ D-015
- [x] `JwtAuthGuard` 全局默认鉴权 + `@Public()` 放行 + `@CurrentUser()` 装饰器
- [x] 注册后自动初始化 `user_profiles`（DB 触发器 `on_auth_user_created`，应用层 `ensureProfile` 幂等兜底）
- [x] 邮箱验证保持开启，验证邮件经 Mailpit 接收（`http://127.0.0.1:54324`）→ D-022
- [x] 前端接真实认证：`services/supabase.ts` + `services/http.ts` + `useAuth` 重写 + 登录页改造
- [x] 登录页按 D-015 改为**只做邮箱**，注册后展示「验证邮件已发送」页并给出 Mailpit 入口
- [x] `GET /api/auth/me` 返回 `{ user, profile }`，前端启动用它判断去登录页/引导页/学习台
- [x] 路由增加 loading 过渡，避免恢复会话期间闪现登录页
- [x] **S3 提前项**：`GET/PUT /api/profile`（没有它引导页保存不了，S2 无法端到端验收）
- [x] 引导页按 A-12 只列出有内容的领域（计算机/IT、职场通用）
- [x] **验收通过**：`npm run smoke` 22/22；`tools/auth-ui.mjs` 浏览器端 25/25
      （含：真注册、真登录、引导落库、刷新后登录态保持、已登录访问 /login 自动跳走、真登出）

> ⚠️ **`tools/e2e.mjs` 已失效**：它过去靠注入 localStorage 伪造登录态，
> 现在认证走真实 Supabase 会话。**已改成「启动即报错退出」**，避免静默产出无意义的失败。
> **重写时机：P2 结束后一次性改对**——现在改等于做两遍（`today`/`history` 接口在 S3 才有，
> 学习链路与评分要等 P2）。**不要删这个文件**，里面 73 项断言编码的是 PRD 业务规则，
> 是重写时的规格参照。这期间回归靠 `npm run smoke` + `npm run auth-ui`，
> 且 S3 每新增一个接口都会配套补测试。
>
> `tools/shots.mjs` 已按 [D-026](./DECISIONS.md) 删除（截图改用按需的一次性脚本）。

### S3 业务接口

- [x] `GET /api/profile`、`PUT /api/profile`（领域 1–3 个 + 每日条数 1–10，边界截断）→ 已在 S2 提前完成
- [ ] `GET /api/cards/:id`
- [ ] `GET /api/today`：今日任务快照（首次进入当天生成并落库；跟读未完成的卡优先补回；排除已到期复习卡；**跨领域补齐兜底**）→ D-004、A-12
- [ ] `GET /api/history`：连续天数、本月/累计卡片、本周趋势（**日期口径统一走本地日期，不用 UTC 字符串前缀比较**）
- [ ] 统一响应/错误格式 + 全局异常过滤器 + 请求日志
- [ ] CORS 配置（本地前端源）→ 已完成基础配置，上线时按 D-020 更新域名
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

- [ ] `AsrProvider` 接口（`transcribe(audio): Promise<{ text; confidence? }>`）
- [ ] **腾讯云 ASR 实现**：`SentenceRecognition` + `tencentcloud-sdk-nodejs-asr`，`EngSerViceType = 16k_en`、`VoiceFormat = wav`、`SourceType = 1` → D-013
- [ ] **前端 WAV 编码工具**：MediaRecorder blob → `decodeAudioData` → 重采样 16kHz 单声道 → 16-bit PCM WAV → base64
      - [ ] 单测：采样率转换、声道降混、WAV 头正确性、时长/体积校验
      - [ ] ⚠️ 腾讯不支持 webm，Chrome 默认录的就是 webm，这一步不能省
- [ ] `LlmProvider` 接口 + DeepSeek 实现（OpenAI 兼容，`base_url = https://api.deepseek.com`）→ D-012
- [ ] 音频上传接口：multipart、**时长/体积双校验**（跟读 3–15s、应答 30–60s、Base64 后 ≤ 3MB）→ [PRD 09](./prd/PRD.md#09-边界与异常处理)
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
- [ ] E2E 重写：现有 `tools/e2e.mjs` 的 73 项断言大部分依赖 localStorage 造数，已失效
      → **P2 结束后一次性重写**（时机与理由见 S2 小节的说明），重写模板用 `tools/auth-ui.mjs`
- [ ] 按 PRD 09 章补 Playwright 主链路用例（登录 → 选领域 → 学一张卡 → 打分 → 入复习队列）

---

## H. 上线前检查清单（准备部署到自有服务器时执行 → D-020）

- [ ] Supabase 云端项目建好，`supabase link` + `db push` 推送 schema 与 migration
- [ ] 服务器上配置 `apps/api/.env`：云端 `DATABASE_URL`、`SUPABASE_*`、`DEEPSEEK_API_KEY`、`TENCENT_*`
- [ ] 前端构建产物（`npm run build:web`）由服务器 Web 服务托管
- [ ] 后端用 pm2 / systemd 守护，开机自启、崩溃自动重启
- [ ] 反向代理 + HTTPS 证书（前端与 `/api` 同域可省掉 CORS 麻烦）
- [ ] 更新 `CORS_ORIGINS` 为服务器域名 → [D-020](./DECISIONS.md#d-020-部署形态自有服务器--云端-supabase)
- [ ] Supabase Auth 的「跳转地址白名单」加入服务器域名
- [ ] 关闭 Supabase 默认开启的邮箱确认限流问题（或配置自定义 SMTP）→ B-4

---

## I. 已完成

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

### P1 S2（认证）
- [x] 2026-09-11 Supabase Auth 接入：全局 JwtAuthGuard + @Public + @CurrentUser
- [x] 2026-09-11 注册自动建 profile 的 DB 触发器（迁移 `20260911050000_user_profile_on_signup`）
- [x] 2026-09-11 前端 `supabase.ts` / `http.ts` / `useAuth` 重写 / 登录页改造 / 路由 loading 过渡
- [x] 2026-09-11 `GET/PUT /api/profile`（提前从 S3 拉过来，保证认证链路端到端可验收）
- [x] 2026-09-11 新增 `tools/api-smoke.mjs`（22 项）与 `tools/auth-ui.mjs`（25 项浏览器端），全绿
- [x] 2026-09-11 修复前端消费 shared 源码的构建问题 → D-025

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
- [x] 2026-09-11 `tools/e2e.mjs`：73 项断言（含 ASR 纯函数单测），曾全绿；认证改造后失效待重写
- [x] 2026-09-11 `tools/README.md`：工具用法与踩坑记录（含 Chrome 假麦克风、autoplay、user-data-dir 三个坑）
- [x] 2026-09-11 ~~`tools/shots.mjs`：14 张页面截图~~ → 已按 [D-026](./DECISIONS.md) 删除，截图改为按需一次性脚本

> ⚠️ 上述「已完成」中，凡涉及**数据来源**的部分（登录态、内容库、进度、排期、评分、转写）将在 P1/P2 被真实实现替换；已完成的是**交互逻辑与算法**，不是数据层。
