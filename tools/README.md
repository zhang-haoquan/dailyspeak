# tools/ — 本地验证脚本

零依赖（只用 Node 内置能力），通过 Chrome DevTools Protocol 驱动真实浏览器，
用来回归 PRD 主链路和核对 UI 还原度。

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

> `--use-fake-*` 提供假麦克风并自动授权，`e2e.mjs` 的「录音 → 回听 → 交接给结果页」
> 断言依赖它；不跑音频用例时可以去掉。
> `--autoplay-policy=...` 是必要的：脚本点击不算用户手势，否则 `audio.play()` 会被拦。
>
> `--user-data-dir` 一定要放在项目目录**之外**：
> 放在项目内会被 Vite 的文件监听捕获，Chrome 每次写 Profile 都会触发整页 reload，
> 页面永远停不下来，脚本会卡在 `Page.navigate`。

## 用法

```powershell
npm run dev                 # 另开一个终端，默认 http://localhost:5173
npm run e2e                 # 主链路行为断言（PRD 5.3 / 5.4 / 5.5）
npm run shots               # 逐页截图到 shots/
```

需要换端口时直接跑脚本并传参：

```powershell
node tools/e2e.mjs http://localhost:5174
node tools/shots.mjs http://localhost:5174 shots
```

## 覆盖范围

`e2e.mjs` 断言（73 项）：

- 今日任务快照：条数、新句/复习配比、当天固定不变
- 「只完成跟读」的卡不会从今日任务里消失，且不计入完成进度
- 完整走通「跟读 → 结果 → 情境应答 → 归档」链路（走无麦克风兜底分支）
- 遗忘曲线排期：新卡建 S1，复习卡一次只推进一级，不波及其它卡
- 历史页统计口径：连续天数、本月/累计卡片、本周趋势图落在今天
- 录音回听：录音后出现回听按钮、生成 `blob:` 音频、真的在播放且进度推进、
  可暂停、并交接给结果页后仍能播放
- ASR 词级比对纯函数（直接 `import('/src/services/asr.ts')` 断言）：
  漏词/替换词/标点大小写/空转写/模拟转写可复现，含「开头漏词不会带偏后续匹配」回归
- 转写回显链路：录音 → 「我听到的」卡片 → 逐词对照 → 词级准确度 →
  结果页分数确实等于 `f(相似度)`

## ASR 供应商切换

跟读的发音分来自「ASR 转写 vs 原句」的词级相似度。转写有两个可替换实现：

| 值 | 行为 |
|---|---|
| `auto`（默认） | 浏览器支持 `SpeechRecognition` 就用真实识别，失败自动降级到模拟 |
| `browser` | 强制使用浏览器原生识别（Chrome/Edge，需联网） |
| `mock` | 强制使用本地模拟转写（离线可复现，界面上标注「模拟转写（演示）」） |

```js
// 浏览器控制台
localStorage.setItem('dailyspeak:asrProvider', 'mock')
// 或
import('/src/services/asr.ts').then(m => m.setAsrPreference('browser'))
```

界面上始终用徽章标出这段文本是**真实识别**还是**模拟**，不会混淆。

`shots.mjs` 输出 14 张截图：登录（桌面/移动/注册/校验报错）、引导、学习台、
场景卡、跟读（回听 + 转写回显）、情境应答、应答回听、跟读结果、历史。
