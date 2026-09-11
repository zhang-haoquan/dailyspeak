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
  --autoplay-policy=no-user-gesture-required `
  about:blank
```

> `--use-fake-*` 提供假麦克风并自动授权，音频相关断言依赖它；不跑音频用例时可以去掉。
> `--autoplay-policy=...` 是必要的：脚本点击不算用户手势，否则 `audio.play()` 会被拦。
>
> `--user-data-dir` 一定要放在项目目录**之外**：
> 放在项目内会被 Vite 的文件监听捕获，Chrome 每次写 Profile 都会触发整页 reload，
> 页面永远停不下来，脚本会卡在 `Page.navigate`。

## 用法

```powershell
npm run db:up               # 本地 Supabase
npm run dev:api             # 后端 :3000
npm run dev:web             # 前端 :5173
```

然后：

| 命令 | 作用 |
| --- | --- |
| `npm run smoke` | **API 冒烟测试**：鉴权边界、注册、邮箱确认、登录、画像自动创建、幂等、重复邮箱（22 项） |
| `node --env-file=apps/api/.env tools/auth-ui.mjs http://localhost:5173` | **浏览器端认证验收**：真登录、引导落库、刷新保持、登出（25 项） |
| `npm run shots` | 逐页截图到 `shots/`（⚠️ 见「待重写」） |
| `npm run e2e` | 学习主链路回归（⚠️ 见「待重写」） |

需要换端口时直接跑脚本并传参。

## ⚠️ 待重写：e2e.mjs 与 shots.mjs

认证改为真实 Supabase 会话之后，这两个脚本**已经失效**——它们过去靠往 localStorage
注入 `dailyspeak:users` / `dailyspeak:session` 来伪造登录态，现在行不通了。

**它们已被改成「启动即报错退出」**，不会静默产出错误结果
（`shots.mjs` 尤其危险：它原本会"成功"输出 14 张一模一样的登录页截图）。

**什么时候重写**：P2 结束后一次性改对。

原因是现在改等于做两遍——脚本要替换的是**取数方式**（localStorage → API），
而 `today` / `history` 接口在 S3 才有，学习链路与评分要等 P2。
在数据层完全落地前重写，改完还得再改一次。

**这期间回归靠什么**：

- `npm run smoke`（API 层）
- `tools/auth-ui.mjs`（浏览器端）
- S3 每新增一个接口，都会像 S2 一样配套补测试，不会出现覆盖断档

**重写方式**参考 `auth-ui.mjs`：admin API 建号 → 浏览器里走真实登录表单 → 再执行断言 / 截图。

**不要删这两个文件**：里面 73 项断言编码的是 PRD 的业务规则
（今日任务快照语义、完成口径、复习卡一次只推进一级、周趋势图必须含今天、词级对齐不能贪婪替换……），
这些规则不会因数据层更换而改变，是重写时的规格参照。

已登记在 [`docs/TODO.md`](../docs/TODO.md) 的 S2 小节与 P4 小节。

## 覆盖范围

### `api-smoke.mjs`（22 项，`npm run smoke`）

- `@Public()` 放行；无令牌 / 伪造令牌被拒
- 注册后邮箱未确认不能登录 → admin 确认 → 登录成功
- `/api/auth/me` 返回用户与画像
- 注册触发自动建 profile（`onboarded=false`、`dailyCount=3`、`domains=[]`）
- 重复访问幂等；重复邮箱不建新号

### `auth-ui.mjs`（25 项，浏览器端）

- 未登录访问 `/`、`/history` 被挡回登录页
- 真实登录 → 新用户进首次引导 → 两步向导保存 → 进学习台
- 引导页只列出有内容的领域（决策 A-12）
- 直接查库核对 `onboarded / domains / daily_count`
- 刷新后登录态保持；已登录访问 `/login` 自动跳走；登出后再次被挡

### `e2e.mjs`（73 项，待重写）

今日任务快照、卡片不丢失、完整学习链路、遗忘曲线推进、历史统计口径、
录音回听、ASR 词级比对与转写回显。

### `shots.mjs`（14 张，待重写）

登录（桌面/移动/注册/校验报错）、引导、学习台、场景卡、跟读回听、
情境应答、应答回听、跟读结果、历史。
