/**
 * P2 学习主链路端到端验收（真实浏览器录音 + 真实第三方评测）
 *
 * 覆盖 PRD 5.4 的完整状态流转：
 *   录音 → 浏览器转 16k 单声道 WAV → 上传 → 腾讯云 ASR → 词级比对 → 打分
 *   → 结果页（分数/反馈/我听到的/逐词对照）→ 情境应答 → DeepSeek 四维评测
 *   → 回学习台看步骤标记 → 排期入队
 *
 * 前置：
 *   1. npm run db:up、npm run dev:api、前端 dev server
 *   2. **必须**给调试 Chrome 加 `--use-file-for-fake-audio-capture=<某段英文 WAV>`，
 *      否则假麦克风是静音，ASR 识别不出内容会返回 400。
 *      音频用 `pwsh tools/make-test-audio.ps1 -Text "..." -Out x.wav` 生成。
 * 运行：
 *   node --env-file=apps/api/.env tools/learning-e2e.mjs <cardId>
 */
const BASE = process.argv[3] ?? 'http://localhost:5173'
const CARD_ID = process.argv[2]
const CDP = 'http://127.0.0.1:9222'

const SUPABASE_URL = process.env.SUPABASE_URL
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY
const SECRET = process.env.SUPABASE_SECRET_KEY

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  PASS  ${name}`)
  } else {
    fail++
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`)
  }
}

if (!SUPABASE_URL || !PUBLISHABLE || !SECRET) {
  console.error('缺少 SUPABASE_* 环境变量（用 --env-file=apps/api/.env 运行）')
  process.exit(1)
}
if (!CARD_ID) {
  console.error('用法：node --env-file=apps/api/.env tools/learning-e2e.mjs <cardId>')
  process.exit(1)
}

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SECRET, authorization: `Bearer ${SECRET}` },
  })
  return res.json()
}

// ---------- 准备账号 ----------
const email = `learn_${Date.now()}_${Math.floor(Math.random() * 1e4)}@example.com`
const password = 'LearnTest1234'
const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', apikey: SECRET, authorization: `Bearer ${SECRET}` },
  body: JSON.stringify({ email, password, email_confirm: true }),
})
if (!created.ok) {
  console.error('创建测试账号失败：', created.status, (await created.text()).slice(0, 200))
  process.exit(1)
}
const userId = (await created.json())?.id
console.log(`测试账号 ${email}`)

// ---------- 接管一个标签页 ----------
const target = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})

let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id !== undefined && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const mid = ++id
    pending.set(mid, { resolve, reject })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
})

const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value
const bodyText = () => evaluate(`document.body.innerText`)
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

async function waitForApp(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ready = await evaluate(`
      (() => {
        const root = document.getElementById('root')
        if (!root || root.innerHTML.length === 0) return false
        const t = root.innerText
        return !t.includes('正在恢复登录状态') && !t.includes('正在加载学习计划')
      })()
    `)
    if (ready) return true
    await sleep(150)
  }
  return false
}

async function waitFor(fn, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fn()) return true
    await sleep(250)
  }
  return false
}

async function goto(path, wait = 900) {
  await send('Page.navigate', { url: BASE + path })
  await sleep(wait)
  await waitForApp()
}

const clickByText = (text) =>
  evaluate(`
    (() => {
      const el = [...document.querySelectorAll('button, a')]
        .find((e) => e.innerText.replace(/\\s+/g, ' ').trim().includes(${JSON.stringify(text)}))
      if (!el) return 'NOT_FOUND'
      el.click()
      return 'CLICKED'
    })()
  `)

const fillInput = (selector, value) =>
  evaluate(`
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return 'NOT_FOUND'
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set
      setter.call(el, ${JSON.stringify(value)})
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return 'OK'
    })()
  `)

// ---------- 登录 ----------
console.log('\n[1] 登录并完成首次引导')
await goto('/login')
await evaluate(`localStorage.clear(); 'ok'`)
await goto('/login')
await fillInput('#account', email)
await fillInput('#password', password)
await clickByText('登录')
await waitFor(async () => (await evaluate('location.pathname')) !== '/login')
await waitFor(async () => (await bodyText()).includes('下一步'), 8000)
await clickByText('下一步')
await sleep(700)
await clickByText('开始今日学习')
await waitFor(async () => (await evaluate('location.pathname')) === '/', 15000)
check('登录并进入学习台', (await evaluate('location.pathname')) === '/')

// 把计划调满，保证被测卡片一定在今日任务里
await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}`, {
  method: 'PATCH',
  headers: {
    apikey: SECRET,
    authorization: `Bearer ${SECRET}`,
    'content-type': 'application/json',
    prefer: 'return=minimal',
  },
  body: JSON.stringify({ daily_count: 10, domains: ['职场通用', '计算机/IT'] }),
})
await fetch(`${SUPABASE_URL}/rest/v1/today_plan?user_id=eq.${userId}`, {
  method: 'DELETE',
  headers: { apikey: SECRET, authorization: `Bearer ${SECRET}`, prefer: 'return=minimal' },
})

// 关键顺序：**先打开学习台生成今日快照，再去练**。
// 反过来的话，快照会在卡片已掌握之后才生成，而 PRD 5.3 规定
// 「已掌握的卡不再作为新句推送」——卡片根本不会进快照，
// 后面的步骤标记断言就注定失败（那是正确行为，不是 bug）。
await goto('/', 1200)
await waitFor(async () => (await evaluate(`document.querySelectorAll('article.ds-card').length`)) > 0, 20000)
const planHasCard = await evaluate(`
  (() => {
    const links = [...document.querySelectorAll('a[href^="/learn/"]')].map((a) => a.getAttribute('href'))
    return links.some((h) => h.startsWith('/learn/${CARD_ID}'))
  })()
`)
check('今日快照已包含被测卡片（练习前生成）', planHasCard === true, String(planHasCard))

// ---------- 跟读：真实录音 + 真实评分 ----------
console.log('\n[2] 跟读：浏览器录音 → 转 WAV → 真实 ASR 打分')
await goto(`/learn/${CARD_ID}`, 1200)
await waitFor(async () => (await bodyText()).includes('跟读'), 10000)
const cardRow = await rest(`scenario_cards?select=sentence&id=eq.${CARD_ID}`)
const sentence = cardRow?.[0]?.sentence
check('学习页加载出卡片原句', norm(await bodyText()).includes(norm(sentence)), String(sentence).slice(0, 60))

// 录音 5 秒（假麦克风在播我们喂进去的英文 WAV）
check('点击开始录音', (await clickByText('点击录音')) !== 'NOT_FOUND' || (await evaluate(`
  (() => { const b = document.querySelector('.ds-mic-btn'); if (!b) return 'NO_BTN'; b.click(); return 'CLICKED' })()
`)) === 'CLICKED')
await sleep(5200)
await evaluate(`document.querySelector('.ds-mic-btn').click(); 'stopped'`)

// 等评测返回：出现「我听到的」或错误提示
const gotTranscript = await waitFor(async () => {
  const t = await bodyText()
  return t.includes('我听到的') || t.includes('识别') || t.includes('至少要说满') || t.includes('暂时不可用')
}, 45000)
const learnText = await bodyText()
check('录音后拿到服务端评测结果', gotTranscript, learnText.slice(0, 200))
check('显示了 ASR 供应商（不是「模拟转写」）', learnText.includes('腾讯云语音识别'), learnText.slice(0, 300))
check('页面上不再出现「模拟 / 演示」字样', !learnText.includes('模拟') && !learnText.includes('演示'))
check('转写文本与原句高度一致（假麦克风播的就是这句）', norm(learnText).includes(norm(sentence).slice(0, 40)), learnText.slice(0, 300))
check('展示了逐词对照', learnText.includes('对比原句'), learnText.slice(0, 400))
check('展示了词级准确度', /词级准确度\s*\d+%/.test(learnText), learnText.slice(0, 400))

// ---------- 结果页 ----------
console.log('\n[3] 结果页：分数与反馈来自服务端')
const finishClicked = await clickByText('完成')
check('点击完成进入结果页', finishClicked === 'CLICKED', finishClicked)
await waitFor(async () => (await evaluate('location.pathname')).startsWith('/result/'), 15000)
const resultText = await bodyText()
check('结果页显示发音得分', resultText.includes('发音得分') || resultText.includes('未打分'), resultText.slice(0, 200))
check('结果页有发音反馈', resultText.includes('发音反馈'), resultText.slice(0, 300))
// 分数环把分数放在 span 里、标签在下面，直接正则抓 innerText 容易抓错；
// 读 aria-label（形如「发音得分 98 分」）更稳
const ringValue = await evaluate(`
  (() => {
    const el = [...document.querySelectorAll('[aria-label]')]
      .find((n) => (n.getAttribute('aria-label') || '').startsWith('发音得分'))
    if (!el) return null
    const m = (el.getAttribute('aria-label') || '').match(/(\\d{1,3})\\s*分/)
    return m ? Number(m[1]) : null
  })()
`)
check('发音得分是一个真实分数（40–98）', typeof ringValue === 'number' && ringValue >= 40 && ringValue <= 98, String(ringValue))
check('结果页也能看到「我听到的」', resultText.includes('我听到的'), resultText.slice(0, 400))

// ---------- 情境应答 ----------
console.log('\n[4] 情境应答：真实 DeepSeek 四维评测')
await clickByText('进入情境应答')
await waitFor(async () => (await evaluate('location.pathname')).includes('/answer'), 15000)
await waitFor(async () => (await bodyText()).includes('面试官提问'), 10000)

// 录 32 秒，满足应答的 30–60 秒窗口（假麦克风文件会循环播放）
await evaluate(`document.querySelector('.ds-mic-btn').click(); 'rec'`)
console.log('        录音 32 秒中…')
await sleep(32000)
await evaluate(`document.querySelector('.ds-mic-btn').click(); 'stopped'`)

const gotAnswer = await waitFor(async () => {
  const t = await bodyText()
  return t.includes('维度评分') || t.includes('未能完成评测') || t.includes('至少要说满') || t.includes('暂时不可用')
}, 60000)
const answerText = await bodyText()
check('应答评测返回结果', gotAnswer, answerText.slice(0, 240))
check('显示了四个维度', ['内容正确性', '语法准确性', '表达流利度', '措辞丰富度'].every((d) => answerText.includes(d)), answerText.slice(0, 300))
check('显示了一句话改进建议', answerText.includes('一句话改进建议'), answerText.slice(0, 400))
check('应答页也不再出现「模拟 / 演示」', !answerText.includes('模拟') && !answerText.includes('演示'))

await clickByText('完成 · 返回学习台')
await waitFor(async () => (await evaluate('location.pathname')) === '/', 15000)

// ---------- 学习台与数据库核对 ----------
console.log('\n[5] 数据真的落库了（不信界面自报）')
// 学习台的数据是异步来的：标题「新句」在骨架屏阶段就渲染了，
// 必须等卡片真的画出来再断言步骤标记，否则会抓到加载中的空页面
const cardsRendered = await waitFor(
  async () => (await evaluate(`document.querySelectorAll('article.ds-card').length`)) > 0,
  20000,
)
check('学习台渲染出今日卡片', cardsRendered, `卡片数 ${await evaluate(`document.querySelectorAll('article.ds-card').length`)}`)
await waitFor(async () => /连续\s*\d+\s*天/.test(await bodyText()), 15000)

const progress = await rest(
  `user_progress?select=repeat_score,answer_score,composite,mode&user_id=eq.${userId}&card_id=eq.${CARD_ID}`,
)
const p = progress?.[0]
check('user_progress 已写入跟读分', typeof p?.repeat_score === 'number', JSON.stringify(progress))
check('user_progress 已写入应答分', typeof p?.answer_score === 'number', JSON.stringify(progress))
check(
  '综合分 = 跟读×0.5 + 应答×0.5',
  p?.composite === Math.round(p.repeat_score * 0.5 + p.answer_score * 0.5),
  JSON.stringify(p),
)

const schedule = await rest(
  `review_schedule?select=stage,due_at&user_id=eq.${userId}&card_id=eq.${CARD_ID}`,
)
check('已生成复习排期 S1', schedule?.[0]?.stage === 1, JSON.stringify(schedule))

const dashText = await bodyText()

// 站内跳回学习台时，TanStack 会先用缓存把卡片画出来、再后台刷新，
// 所以「标记变已完成」需要等一小会儿。这里等的正是要断言的东西：
// 等不到就是真失败，不是断言写法问题。
const inAppMarked = await waitFor(
  async () => (await evaluate(`document.querySelectorAll('.ds-step-done').length`)) >= 1,
  15000,
)
check(
  '站内返回学习台后，步骤标记自动更新为已完成',
  inAppMarked,
  `ds-step-done × ${await evaluate(`document.querySelectorAll('.ds-step-done').length`)}`,
)

// 再整页刷新一次：排除缓存因素，确认这是真的落库了而不是内存里的假象
await goto('/', 1200)
await waitFor(async () => (await evaluate(`document.querySelectorAll('article.ds-card').length`)) > 0, 20000)
await waitFor(async () => (await evaluate(`document.querySelectorAll('.ds-step-done').length`)) >= 1, 15000)
const stepDone = await evaluate(`document.querySelectorAll('.ds-step-done').length`)
check('刷新后步骤标记依然是已完成（确实落库）', stepDone >= 1, `ds-step-done × ${stepDone}`)
check('学习台顶部摘要显示已打卡', /连续\s*1\s*天/.test(await bodyText()), (await bodyText()).slice(0, 160))

const lsKeys = await evaluate(`Object.keys(localStorage).filter((k) => k.startsWith('dailyspeak:'))`)
check('localStorage 里没有项目数据', (lsKeys ?? []).length === 0, JSON.stringify(lsKeys))

console.log(`\n结果：${pass} passed, ${fail} failed\n`)
ws.close()
process.exit(fail === 0 ? 0 : 1)
