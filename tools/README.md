# tools/ — 本地验证脚本

零依赖（只用 Node 内置能力），通过 Chrome DevTools Protocol 驱动真实浏览器 / 真实 API，
用来回归 PRD 主链路与验收各阶段成果。

## 前置：启动一个带调试端口的 Chrome

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --headless=new --disable-gpu --no-first-run --disable-extensions `
  --remote-debugging-port=9222 `
  --user-data-dir="$env:TEMP\dailyspeak-chrome" `
  --window-size=1280,900 `
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream `
  --use-file-for-fake-audio-capture="$env:TEMP\ds-repeat.wav" `
  --autoplay-policy=no-user-gesture-required `
  about:blank
```

> `--use-fake-*` 提供假麦克风并自动授权。**跑 `learning-e2e.mjs` 时必须再加
> `--use-file-for-fake-audio-capture=<一段英文 WAV>`**，否则假麦克风是静音，
> 服务端会如实返回「没有识别到任何内容」（400），链路断言就跑不下去。
> 音频用 `pwsh tools/make-test-audio.ps1` 生成（见下）。
>
> `--autoplay-policy=...` 是必要的：脚本点击不算用户手势，否则 `audio.play()` 会被拦。
>
> `--user-data-dir` 一定要放在项目目录**之外**：
> 放在项目内会被 Vite 的文件监听捕获，Chrome 每次写 Profile 都会触发整页 reload，
> 页面永远停不下来，脚本会卡在 `Page.navigate`。

## 生成测试音频

```powershell
# 跟读用（3–15 秒）：读卡片原句
pwsh tools/make-test-audio.ps1 -Text "I am a software developer with three years of experience." -Out "$env:TEMP\ds-repeat.wav"

# 应答用（30–60 秒）：读一段较长的回答
pwsh tools/make-test-audio.ps1 -Text "<约 100 词的英文回答>" -Out "$env:TEMP\ds-answer.wav"
```

依赖 Windows 自带的 SAPI 语音合成（`Microsoft Zira`，en-US）。脚本直接以
16kHz / 单声道 / 16-bit 输出，正好是服务端要求的格式，不用再转码。
macOS / Linux 请用 `say -o out.aiff` 或 `espeak-ng` + `ffmpeg -ar 16000 -ac 1` 自行生成。

## 用法

```powershell
npm run db:up               # 本地 Supabase
npm run dev:api             # 后端 :3000
npm run dev:web             # 前端 :5173
```

| 命令 | 作用 | 依赖 |
| --- | --- | --- |
| `npm run smoke` | **API 冒烟测试**：鉴权边界、注册、邮箱确认、登录、画像、卡片详情、今日快照、历史统计、错误格式（58 项） | 后端 |
| `npm run auth-ui` | **浏览器端验收**：真登录、引导落库、刷新保持、登出，**以及前端确实在消费真实接口**（44 项） | 后端 + 前端 + Chrome |
| `npm run check:providers` | **AI 供应商自检**：DeepSeek 对话 + 腾讯云一句话识别（7 项） | 后端 `.env` + 出网 |
| `npm run score-e2e` | **真实第三方评分端到端**（`<cardId> <repeat.wav> <answer.wav>`，57 项） | 后端 + 两家第三方 |
| `npm run learning-e2e` | **真实浏览器录音端到端**（`<cardId>`，28 项） | 上面全部 + 前端 + 带假音频的 Chrome |
| `npm run e2e` | 学习主链路回归（73 项，⚠️ 待重写） | — |
| `npm run stop` | **收工**：停前后端 + 本地 Supabase + 调试 Chrome（`-- -IncludeDocker` 连 Docker Desktop 一起关） | — |

## 收工（`stop-all.ps1`）

每天下班关服务用的，按**端口**关而不是按进程名，所以不会误伤别的 node 进程
（本机同时跑着 DeepSeek Harness 自己的 node，按名字杀会把会话弄断）。

```powershell
npm run stop                      # 停前后端 + 本地 Supabase + 调试 Chrome
npm run stop -- -IncludeDocker    # 连 Docker Desktop 一起退出
pwsh tools/stop-all.ps1 -DryRun   # 只报告会关哪些，不动手
```

- 停 `:3000`（后端）、`:5173` / `:5175`（前端，**端口不一定在 5173**）
- `npx supabase stop`：数据保留在 Docker 卷里，下次 `db:up` 会回来
- 只关 `--user-data-dir` 指向 `%TEMP%\dailyspeak-chrome` 的 Chrome，不碰你日常用的浏览器
- Docker Desktop 默认不动，要一起退加 `-IncludeDocker`
- **幂等**：本来就关着的东西报「本来就没在跑」，不报错

跑之前会先探一下 Docker 是否在运行：Docker Desktop 已经退出时 `supabase stop` 会抛一个
看不懂的命名管道错误（`open //./pipe/dockerDesktopLinuxEngine`），那是「本来就没跑」，
不是故障——脚本把它识别成 skip，不打假警报（这是写这个脚本时实际踩到的）。

需要换端口时直接跑脚本并传参：

```powershell
node --env-file=apps/api/.env tools/auth-ui.mjs http://localhost:5173
```

## 截图怎么办？

**没有截图脚本，也不需要。** 曾经有过 `tools/shots.mjs`（一键输出 14 张页面截图），
已按决策 [D-026](../docs/DECISIONS.md) 删除。

理由：那个脚本的价值只在「我需要看页面」，而这点用**一次性脚本**就能满足——
要检查某个页面时临时写十几行 CDP 代码渲染出图，看完即删。为此长期维护一个
「跟随每个页面改动」的脚本并不划算（它正是因此失效的）。

日常看界面请在浏览器里直接打开 <http://localhost:5173>；与设计稿逐页对比用
`design/pages/` 下的 HTML。

## ⚠️ 待重写：e2e.mjs

认证改为真实 Supabase 会话之后，这个脚本**已经失效**——它过去靠往 localStorage
注入 `dailyspeak:users` / `dailyspeak:session` 来伪造登录态，现在行不通了。

**它已被改成「启动即报错退出」**，不会静默产出一串无意义的失败。

**什么时候重写**：P2 结束后一次性改对。原因是现在改等于做两遍——脚本要替换的是
**取数方式**（localStorage → API），而 `today` / `history` 接口在 S3 才有，
学习链路与评分要等 P2。在数据层完全落地前重写，改完还得再改一次。

**这期间回归靠什么**：

- `npm run smoke`（API 层）
- `npm run auth-ui`（浏览器端）
- S3 每新增一个接口，都会像 S2 一样配套补测试，不会出现覆盖断档

**重写方式**参考 `auth-ui.mjs`：admin API 建号 → 浏览器里走真实登录表单 → 再执行断言。

**不要删这个文件**：里面 73 项断言编码的是 PRD 的业务规则
（今日任务快照语义、完成口径、复习卡一次只推进一级、周趋势图必须含今天、词级对齐不能贪婪替换……），
这些规则不会因数据层更换而改变，是重写时的规格参照。

已登记在 [`docs/TODO.md`](../docs/TODO.md) 的 S2 小节与 P4 小节。

### `providers-check.mjs`（7 项，`npm run check:providers [audio.wav]`）

- DeepSeek：密钥已配、发一次最小对话、**返回了非空文本**（会打印模型名与耗时）
- 腾讯云 ASR：密钥已配、音频在 3MB 限制内、一句话识别调用成功
  - 传音频文件：断言**识别出了非空文本**，并打印识别结果、引擎、耗时
  - 不传：发 1 秒静音，只验证鉴权与连通（静音返回空文本是正常的）

> ⚠️ 别用 `max_tokens: 8` 测「回一个词」：`deepseek-flash` / `deepseek-v4-pro` 都是推理模型，
> 推理 token 与正文共用预算，给小了会「HTTP 200 但 content 为空」，看起来像密钥问题。

### `score-e2e.mjs`（57 项，`npm run score-e2e -- <cardId> <repeat.wav> <answer.wav>`）

打真实接口、再回查数据库核对，**不信任何一层自报**：

- 边界：无令牌 401、缺 audio 字段 400、卡片不存在 404、时长不足 400、非 WAV 400
- 跟读：未降级、分数 40–98、**分数可用返回的 similarity 复算**、带转写/供应商/逐词对齐/反馈
- 落库：`repeat_score` 与接口一致、`answer_score` 仍为空、**跟读阶段不产生排期**（D-006）
- 应答：四维齐全且 0–100、**应答分 = 四维加权可复算**、有改进建议
- 整卡完成：`composite = 跟读×0.5 + 应答×0.5`、生成 S1 排期、到期时间为次日 00:00
- 学习台/历史：卡片仍在今日快照里（**快照当天不变**）、步骤标记为已完成、历史分数是综合分
- 幂等：重复提交不报错、`user_progress` 仍只有一行、**排期不会连跳阶段**
- 静音音频：返回 400「没有识别到任何内容」，**不是伪造 40 分**

### `learning-e2e.mjs`（28 项，`npm run learning-e2e -- <cardId>`）

真实浏览器 + 真实录音 + 真实第三方，跑完 PRD 5.4 的完整状态流转：

- 登录 → 引导 → 学习台生成今日快照（**练习前就生成**，否则已掌握的卡不会进快照）
- 学习页录音 5 秒 → 浏览器转 16k 单声道 WAV → 上传 → 真实 ASR 打分
- 断言：拿到服务端结果、显示「腾讯云语音识别」、**页面上没有任何「模拟 / 演示」字样**、
  转写与原句一致、展示逐词对照与词级准确度
- 结果页：发音得分是 40–98 的真实分数（读 `aria-label`，不靠正则猜 DOM）
- 情境应答：录 32 秒 → 真实 DeepSeek 四维评测 → 四个维度 + 一句话建议
- 落库：`user_progress` 两个分数与综合分自洽、排期 S1、**刷新后步骤标记依然已完成**
- `localStorage` 里没有任何 `dailyspeak:` 数据

## 覆盖范围

### `api-smoke.mjs`（58 项，`npm run smoke`）

**认证与鉴权边界（S2）**

- `@Public()` 放行；无令牌 / 伪造令牌被拒
- 注册后邮箱未确认不能登录 → admin 确认 → 登录成功
- `/api/auth/me` 返回用户与画像
- 注册触发自动建 profile（`onboarded=false`、`dailyCount=3`、`domains=[]`）
- 重复访问幂等；重复邮箱不建新号

**业务接口（S3）**

- `GET /api/cards/:id`：内容/原句/中文/提问齐全、不下发审核字段、未学过时 `progress`/`review` 为 `null`
- 不存在的卡片 → 404 + 统一错误体；无令牌 → 401 + `UNAUTHORIZED`
- `GET /api/today`：`dateKey` 为本地日期、卡片数等于每日条数、每张卡带完整内容、步骤标记初始未完成、无内容告警
- **当天重复请求返回同一份快照（顺序也一致）**——验证 D-004
- 改学习计划后快照作废并按新条数重新生成（D-027）
- `GET /api/history`：新账号各项为 0、周趋势固定 7 个桶、`recent` 为空、无令牌 401
- 统一校验错误（D-030）：`VALIDATION_FAILED` + 字段级 `details`、未知字段被拒、空领域数组、暂不可用领域被拒

### `auth-ui.mjs`（44 项，`npm run auth-ui`）

**认证链路（S2）**

- 未登录访问 `/`、`/history` 被挡回登录页
- 真实登录 → 新用户进首次引导 → 两步向导保存 → 进学习台
- 引导页只列出有内容的领域（决策 A-12）
- 直接查库核对 `onboarded / domains / daily_count`
- 刷新后登录态保持；已登录访问 `/login` 自动跳走；登出后再次被挡

**前端接真实接口（S4）**

- 学习台卡片数 = 服务端 `today_plan` 快照条数；页面上的原句与数据库内容逐字一致（证明不是本地硬编码）
- 页面不再出现「模拟 / 演示」字样
- **`localStorage` 里没有任何 `dailyspeak:` 数据**（S4 硬性验收；浏览完整链路后再查一次）
- 学习页渲染出 `GET /api/cards/:id` 的原句与中文释义
- 卡片不存在时给出错误态而不是白屏
- 学习记录页渲染出三项统计、周趋势固定 7 根柱子、新账号显示空态
- 内容不足时**跨领域补齐到每日条数并出现告警条**（PRD 09）

> 写页面断言的两条经验（都踩过）：
> 1. 等页面就绪不能只看 `#root` 有内容——整页加载会先渲染「正在恢复登录状态…」过渡页，
>    它同样有内容。`waitForApp()` 必须等过渡页过去。
> 2. 数据走接口之后，固定 `sleep` 会周期性失败（dev 首次编译模块尤其慢），
>    一律用 `waitFor(predicate)` 轮询到该出现的出现。
>
> 这两条在重写 `e2e.mjs` 时同样适用，直接照抄这两个 helper 即可。

### `e2e.mjs`（73 项，待重写）

今日任务快照、卡片不丢失、完整学习链路、遗忘曲线推进、历史统计口径、
录音回听、ASR 词级比对与转写回显。
