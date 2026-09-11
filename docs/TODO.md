# 待办清单

> **规则**
> 1. 每完成一项，把 `[ ]` 改成 `[x]`，并在行尾补上完成日期。
> 2. **新增需求先更新 [`prd/PRD.md`](./prd/PRD.md)，再来这里登记**；口径类的新增同时记入 [`DECISIONS.md`](./DECISIONS.md)。
> 3. 涉及决策的条目，行尾用 `→ D-xxx` 指向决策记录。
> 4. 优先级：`P0` 准备 → `P1` 后端基础 → `P2` 评分链路 → `P3` 内容管道 → `P4` 边界与测试。P1 是主线，P3/P4 可与 P2 并行。

## 当前卡点

**P1 无法开工**，原因是两项输入没到位：

- 🔴 **A 区**（待你确认的 10 个决策）未确认，其中 D-014 目录结构直接决定代码怎么落。
- 🔴 **B 区**（凭证）未提供，没有 Supabase 与 AI 供应商 Key，后端写完也无法运行和验证。

---

## A. 待你确认（阻塞后续开发）

- [ ] 🟡 **A-1** LLM 供应商选型：通义千问 还是 豆包 → [D-012](./DECISIONS.md#d-012-llm-供应商选型待确认)
- [ ] 🟡 **A-2** ASR 供应商选型：通义 Paraformer / 火山 ASR / 讯飞 → [D-013](./DECISIONS.md#d-013-asr-供应商选型待确认)
- [ ] 🟡 **A-3** 仓库目录结构：monorepo（`apps/web` + `apps/api`）还是根目录加 `server/` → [D-014](./DECISIONS.md#d-014-仓库目录结构待确认)
- [ ] 🟡 **A-4** 认证范围：本轮是否只做邮箱 + 密码，手机号后置 → [D-015](./DECISIONS.md#d-015-认证范围待确认)
- [ ] 🟡 **A-5** 「重听原声」：保留浏览器 TTS，还是服务端 TTS 预生成参考音频 → [D-016](./DECISIONS.md#d-016-参考音频方案待确认)
- [ ] 🟡 **A-6** 用户录音是否落库（Supabase Storage），以支持历史回听 → [D-017](./DECISIONS.md#d-017-音频是否落库待确认)
- [ ] 🟡 **A-7** 内容生成管道：本轮就做，还是先迁 10 张卡入库、管道放 P3 → [D-018](./DECISIONS.md#d-018-内容生成管道排期待确认)
- [ ] 🟡 **A-8** 离线缓存（Service Worker + IndexedDB）本轮做还是后置 → [D-019](./DECISIONS.md#d-019-离线缓存排期待确认)
- [ ] 🟡 **A-9** 部署形态：仅本地跑通，还是一并规划上线 → [D-020](./DECISIONS.md#d-020-部署形态待确认)
- [ ] 🟡 **A-10** 是否先 `git init` 建立基线（**建议强烈同意**，否则这次重写没有回滚点）→ [D-021](./DECISIONS.md#d-021-版本控制基线待确认)
- [ ] 🟡 **A-11** 首发上线的卡片数量目标（建议每领域 ≥ 20 张，否则复习队列很快见底）→ 关联 [D-018](./DECISIONS.md#d-018-内容生成管道排期待确认)
- [ ] 🟡 **A-12** 「金融 / 汽车制造」两个领域暂无内容：是补内容，还是先从首次引导的选项里下掉 → 关联 [PRD 09 章](./prd/PRD.md#09-边界与异常处理)

---

## B. 需要你提供的凭证

- [ ] 🔴 **B-1** Supabase：`Project URL`、`anon key`、`service_role key`
      （或授权我用 Supabase CLI 在你账号下创建项目；若不用 Supabase，请说明改用本地 Docker Postgres + 自建 JWT）
- [ ] 🔴 **B-2** LLM API Key：DashScope `sk-...` 或 火山方舟 `ARK_API_KEY`（依 A-1）
- [ ] 🔴 **B-3** ASR 服务凭证：选定服务后我给出精确清单（依 A-2）
- [ ] 🟡 **B-4** 邮件发送（可选）：Supabase 自带 SMTP 限流很严，生产建议配 Resend / 阿里云邮件推送
- [ ] 🟡 **B-5** 短信服务商（仅当 A-4 选择做手机号登录时才需要）

---

## C. P0 准备

- [ ] `git init` + 首次基线提交（含 `.gitignore`，排除 `node_modules/`、`dist/`、`shots/`）→ D-021
- [ ] 按 A-3 的结论落地目录结构；搬迁现有前端
- [ ] 前端依赖补装：HTTP 客户端与数据获取方案定型
- [ ] 后端骨架：NestJS + TypeScript + ESLint/Prettier
- [ ] Prisma 接入 + `DATABASE_URL` 连接 Supabase Postgres
- [ ] `@supabase/supabase-js` 与服务端校验 JWT 的方案定型
- [ ] 环境变量管理：`.env` 不进门禁库，补 `.env.example` 说明每个变量从哪来
- [ ] `packages/shared`：前后端共用类型（`ScenarioCard` / `UserProfile` / `TodayCard` / `RepeatScore` / `AnswerScore`）

---

## D. P1 后端基础（主线）

### 数据层

- [ ] Prisma schema：`user_profiles` / `scenario_cards` / `user_progress` / `review_schedule` / `today_plan` → [PRD 07 章](./prd/PRD.md#07-数据模型)
- [ ] 补 PRD 07 章 `[v0.2]` 的约束：`user_progress` 唯一键 `(user_id, card_id)`、`review_schedule` 唯一键与 `(user_id, due_at)` 索引、`today_plan` 唯一键 `(user_id, date_key)`
- [ ] 首次 migration + 本地可复现的 seed 脚本
- [ ] `ReviewService`：把 `src/services/review.ts` 的遗忘曲线算法迁到后端 → D-006
- [ ] `ReviewService` 单测：阶段间隔边界、分数回退、封顶 S6

### 认证

- [ ] Supabase Auth 集成（注册 / 登录 / 登出 / session 刷新）→ D-015
- [ ] `JwtGuard` + `@CurrentUser()` 装饰器，保护所有业务接口
- [ ] 注册后自动初始化 `user_profiles`（`onboarded = false`）

### 业务接口

- [ ] `GET /api/profile`、`PUT /api/profile`（领域多选 + 每日条数，1–10 边界截断）→ [PRD 5.2](./prd/PRD.md#52-首次引导选领域--定学习计划p2)
- [ ] `GET /api/cards/:id`
- [ ] `GET /api/today`：今日任务快照生成（首次进入当天生成并落库；跟读未完成的卡优先补回；排除已到期复习卡）→ D-004
- [ ] `GET /api/history`：连续天数、本月/累计卡片、本周趋势（**注意日期口径统一走本地日期，不用 UTC 字符串前缀比较**）
- [ ] 统一响应/错误格式 + 全局异常过滤器 + 请求日志
- [ ] CORS 与前端源配置

### 前端改造（去 mock 第一批）

- [ ] 新增 `services/http.ts`：fetch 封装、注入 Authorization、401 刷新、超时与重试
- [ ] 重写 `hooks/useAuth.tsx`：接 Supabase session，替换 localStorage 假登录（**同时删掉明文密码存储**）
- [ ] `pages/Login.tsx`：接真实注册/登录，删除 `setTimeout` 假延迟
- [ ] `pages/Onboarding.tsx` → `PUT /api/profile`
- [ ] `pages/Dashboard.tsx` → `GET /api/today` + 骨架屏
- [ ] `pages/History.tsx` → `GET /api/history`
- [ ] 全局补齐**加载态 / 空态 / 错误态**（现在一个都没有）
- [ ] 删除 `services/storage.ts`、`services/api.ts`（localStorage 假后端）
- [ ] 删除 `data/cards.ts`（硬编码 10 张种子卡）

---

## E. P2 评分链路（核心）

### 后端

- [ ] `AsrProvider` 接口 + 首个供应商实现 → D-013
- [ ] `LlmProvider` 接口 + 首个供应商实现 → D-012
- [ ] 音频上传接口：multipart、**时长/格式/大小校验**（跟读 3–15s、应答 30–60s）→ [PRD 09](./prd/PRD.md#09-边界与异常处理)
- [ ] 词级对齐算法下沉后端（归一化 → LCS 对齐 → 相似度），含单测
      - [ ] 覆盖「开头漏词不会带偏后续匹配」这条回归
- [ ] `POST /api/score/repeat`：ASR → 词级比对 → 分数/反馈/`transcript`/`transcriptSource`/`alignment`/`similarity` → D-008、D-009
- [ ] `POST /api/score/answer`：ASR → LLM 四维评测（内容 40 / 语法 25 / 流利度 20 / 措辞 15）
- [ ] 第三方超时/失败的**重试 3 次 + 降级**（降级为「仅记完成、不打分」）→ [PRD 09](./prd/PRD.md#09-边界与异常处理)
- [ ] 提交幂等：同一 `(user_id, card_id)` 以最后一次有效提交为准 → D-006
- [ ] 打分成功后写入 `user_progress`，整卡完成时推进 `review_schedule`

### 前端

- [ ] `pages/Learning.tsx`：录音 → `FormData` 上传 → 展示服务端返回的分数/反馈/转写/逐词对照
- [ ] `pages/Answer.tsx`：同上
- [ ] `pages/Result.tsx`：分数与反馈来自服务端
- [ ] `components/TranscriptCard.tsx`：去掉「模拟转写（演示）」徽章，改为显示真实 ASR 供应商
- [ ] 删除 `services/scoring.ts`（假打分）、`services/asr.ts`（模拟转写与错词表）、`hooks/useTranscriber.ts`
- [ ] `hooks/useRecorder.ts`：保留（MediaRecorder 采集是真实能力），补上传与失败处理
- [ ] 录音失败/权限拒绝的**文本输入兜底** → [PRD 09](./prd/PRD.md#09-边界与异常处理)

---

## F. P3 内容管道

- [ ] `scenario_cards` 状态机：`draft` → `review` → `published`，只有 `published` 参与调度
- [ ] AI 批量生成候选：prompt 模板 + 批量任务 + 结果落 `draft`
- [ ] 人工抽审接口：待审列表 / 通过 / 驳回 / 编辑
- [ ] 现有 10 张种子卡迁移入库并置为 `published`
- [ ] 补齐首发内容量至目标（依 A-11），覆盖计算机 / IT 与职场通用
- [ ] 处理 A-12：补齐金融 / 汽车制造内容，或从首次引导选项中下掉
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

### 样式与登录（→ D-001 / D-002 / D-003）
- [x] 2026-09-11 修复登录页 UI 错乱：根因是**工程从未安装 Tailwind**，补齐 v4 接入
- [x] 2026-09-11 登录/注册页：字段级内联校验、密码可见性切换、图标语义修正（LogIn / UserPlus / ShieldCheck）
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
