/**
 * 前端认证端到端测试（P1 S2 验收）
 *
 * 验证 S2 的验收标准：能真注册、真登录、真登出，刷新后登录态保持。
 * 另外覆盖：未登录被挡回登录页、完成引导后落库、领域选项只含有内容的领域。
 *
 * 前置：
 *   1. npm run db:up
 *   2. npm run dev:api        （后端 :3000）
 *   3. 前端 dev server        （默认 5173，可用参数指定）
 *   4. 带调试端口的 Chrome   （见 tools/README.md）
 * 运行：
 *   node --env-file=apps/api/.env tools/auth-ui.mjs http://localhost:5173
 */
const BASE = process.argv[2] ?? 'http://localhost:5173'
const CDP = 'http://127.0.0.1:9222'

const SUPABASE_URL = process.env.SUPABASE_URL
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

if (!SUPABASE_URL || !SECRET) {
  console.error('缺少 SUPABASE_URL / SUPABASE_SECRET_KEY（用 --env-file=apps/api/.env 运行）')
  process.exit(1)
}

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
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})

const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value

/**
 * 等应用真正就绪。
 *
 * 注意不能只看 `#root` 有没有内容：整页加载时路由会先渲染「正在恢复登录状态…」
 * 过渡页，它同样有内容，但页面还没稳定。必须等过渡页过去再断言，
 * 否则会周期性抓到 Splash 而不是目标页面。
 */
async function waitForApp(timeoutMs = 12000) {
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

async function goto(path, wait = 900) {
  await send('Page.navigate', { url: BASE + path })
  await sleep(wait)
  await waitForApp()
}

/** 等 URL 变成指定路径（prefix 为 '/' 时要求精确匹配，否则任何路径都算命中） */
async function waitForPath(prefix, timeoutMs = 12000) {
  const matches = (p) => (prefix === '/' ? p === '/' : p.startsWith(prefix))
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const p = await evaluate('location.pathname')
    if (typeof p === 'string' && matches(p)) return p
    await sleep(200)
  }
  return await evaluate('location.pathname')
}

/**
 * 轮询直到条件成立。
 * 页面数据改成走接口之后，固定 sleep 会周期性失败（dev 首次编译模块尤其慢），
 * 断言前一律用它等到该出现的出现、该消失的消失。
 */
async function waitFor(fn, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fn()) return true
    await sleep(200)
  }
  return false
}

/** 往受控 input 里填值（必须走原生 setter 才能触发 React 的 onChange） */
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

const bodyText = () => evaluate(`document.body.innerText`)

/** 空白归一化：DOM 里换行会导致长句被拆开，直接 includes 会漏判 */
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/** 走 Supabase REST 直接查库（用 secret key，绕过 RLS 看真相） */
async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SECRET, authorization: `Bearer ${SECRET}` },
  })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { error: text }
  }
}

/** 走 Supabase REST 直接改库（用于准备确定性的测试前置） */
async function restWrite(path, method, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SECRET,
      authorization: `Bearer ${SECRET}`,
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return res.ok
}

/** localStorage 里残留的项目私有键（S4 要求：一个都不能有） */
const dailyspeakKeys = () =>
  evaluate(`Object.keys(localStorage).filter((k) => k.startsWith('dailyspeak:'))`)

// ---------- 准备一个已确认邮箱的测试账号 ----------
const email = `ui_${Date.now()}_${Math.floor(Math.random() * 1e4)}@example.com`
const password = 'UiTest1234'

const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    apikey: SECRET,
    authorization: `Bearer ${SECRET}`,
  },
  body: JSON.stringify({ email, password, email_confirm: true }),
})
if (!created.ok) {
  console.error('创建测试账号失败：', created.status, await created.text())
  process.exit(1)
}
console.log(`测试账号：${email}`)

// ---------- 1. 未登录访问受保护路由 ----------
console.log('\n[1] 未登录时被挡回登录页')
// 同一个浏览器 profile 会残留上一次的 Supabase 会话，先清干净保证测试可重复
await goto('/login')
await evaluate(`localStorage.clear(); 'ok'`)
await goto('/')
check('访问 / 被重定向到 /login', (await evaluate('location.pathname')) === '/login', await evaluate('location.pathname'))
await goto('/history')
check('访问 /history 同样被挡', (await evaluate('location.pathname')) === '/login', await evaluate('location.pathname'))

// ---------- 2. 登录 ----------
console.log('\n[2] 真实登录')
await goto('/login')
const loginPageText = await bodyText()
check('登录页显示邮箱字段（D-015 只做邮箱）', loginPageText.includes('邮箱') && !loginPageText.includes('手机号'), loginPageText.slice(0, 80))

check('填入邮箱', (await fillInput('#account', email)) === 'OK')
check('填入密码', (await fillInput('#password', password)) === 'OK')
check('点击登录', (await clickByText('登录')) === 'CLICKED')

// 新用户 onboarded=false，应被送到 /onboarding
const afterLogin = await waitForPath('/onboarding')
check('登录后进入首次引导页', afterLogin === '/onboarding', afterLogin)

// ---------- 3. 首次引导落库 ----------
console.log('\n[3] 首次引导保存到服务端（两步向导）')
const onboardText = await bodyText()
check('引导页只列出有内容的领域', onboardText.includes('计算机/IT') && onboardText.includes('职场通用'), onboardText.slice(0, 100))
check('引导页不再出现金融 / 汽车制造（A-12）', !onboardText.includes('金融') && !onboardText.includes('汽车制造'), onboardText.slice(0, 160))

check('第 1 步：点击下一步', (await clickByText('下一步')) === 'CLICKED')
await sleep(600)
check('第 2 步出现开始按钮', (await bodyText()).includes('开始今日学习'), (await bodyText()).slice(0, 120))
check('点击开始今日学习', (await clickByText('开始今日学习')) === 'CLICKED')
const afterOnboarding = await waitForPath('/')
check('保存后进入学习台', afterOnboarding === '/', afterOnboarding)

// 直接查库核对是否真的落库。
// 注意：不要从 localStorage 里猜 supabase 的会话 key，直接按邮箱查 admin 用户列表最稳。
const usersRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
  headers: { apikey: SECRET, authorization: `Bearer ${SECRET}` },
})
const users = (await usersRes.json())?.users ?? []
const me = users.find((u) => u.email === email)
const userId = me?.id
check('能在 auth.users 里找到该账号', typeof userId === 'string' && userId.length > 0, String(userId))

const profileRows = await (
  await fetch(
    `${SUPABASE_URL}/rest/v1/user_profiles?select=onboarded,daily_count,domains&user_id=eq.${userId}`,
    { headers: { apikey: SECRET, authorization: `Bearer ${SECRET}` } },
  )
).json()
const row = Array.isArray(profileRows) ? profileRows[0] : null
check('数据库里 profile.onboarded = true', row?.onboarded === true, JSON.stringify(row))
check('数据库里已保存所选领域', Array.isArray(row?.domains) && row.domains.length === 2, JSON.stringify(row?.domains))
check('数据库里已保存每日条数', typeof row?.daily_count === 'number', JSON.stringify(row))

// ---------- 4. 刷新后登录态保持 ----------
console.log('\n[4] 刷新后登录态保持')
await send('Page.reload', { ignoreCache: false })
await sleep(2500)
await waitForApp()
check('刷新后仍停留在学习台', (await evaluate('location.pathname')) === '/', await evaluate('location.pathname'))
const dashText = await bodyText()
check('学习台渲染出今日任务', dashText.includes('新句') || dashText.includes('复习'), dashText.slice(0, 120))
check('学习台不再出现登录表单', !dashText.includes('欢迎回来'), dashText.slice(0, 120))

// ---------- 5. 直接访问 /login 会被带回 ----------
console.log('\n[5] 已登录时访问 /login 自动跳走')
await goto('/login')
await sleep(800)
check('已登录用户不会停在登录页', (await evaluate('location.pathname')) !== '/login', await evaluate('location.pathname'))

// ---------- 6. 学习台数据来自服务端（S4 验收） ----------
console.log('\n[6] 学习台接真实接口（GET /api/today）')

// 今日任务现在是网络请求，不再同步就绪——等卡片真正渲染出来再断言
await goto('/', 900)
await waitFor(async () => (await evaluate(`document.querySelectorAll('article.ds-card').length`)) > 0)

const planRows = await rest(`today_plan?select=date_key,tasks&user_id=eq.${userId}`)
const plan = Array.isArray(planRows) ? planRows[0] : null
check('服务端已落库今日快照', Boolean(plan?.tasks), JSON.stringify(planRows).slice(0, 160))

const planCardIds = (plan?.tasks ?? []).map((t) => t.cardId)
const planCards = await rest(
  `scenario_cards?select=id,sentence,domain&id=in.(${planCardIds.join(',') || 'none'})`,
)
const planSentences = Array.isArray(planCards) ? planCards.map((c) => c.sentence) : []

const dashNow = await bodyText()
const renderedCards = await evaluate(`document.querySelectorAll('article.ds-card').length`)
check(
  '学习台卡片数 = 服务端快照条数',
  renderedCards === planCardIds.length && planCardIds.length > 0,
  `渲染 ${renderedCards} 张 / 快照 ${planCardIds.length} 条`,
)
check(
  '页面上的原句与数据库内容一致（不是本地硬编码）',
  planSentences.some((s) => norm(dashNow).includes(norm(s))),
  `期望包含其一：${planSentences.map((s) => norm(s).slice(0, 30)).join(' | ')}`,
)
check(
  '学习台不再出现「模拟 / 演示」字样',
  !dashNow.includes('模拟') && !dashNow.includes('演示'),
  dashNow.slice(0, 160),
)

const lsKeys = await dailyspeakKeys()
check('localStorage 里没有任何 dailyspeak: 数据（S4 验收）', (lsKeys ?? []).length === 0, JSON.stringify(lsKeys))

// ---------- 7. 学习页内容来自服务端 ----------
console.log('\n[7] 学习页接 GET /api/cards/:id')
const firstCardId = planCardIds[0]
const firstCard = await rest(`scenario_cards?select=sentence,translation&id=eq.${firstCardId}`)
const expectSentence = firstCard?.[0]?.sentence
const expectTranslation = firstCard?.[0]?.translation

await goto(`/learn/${firstCardId}`, 600)
await waitFor(async () => norm(await bodyText()).includes(norm(expectSentence)))
const learnText = await bodyText()
check(
  '学习页渲染出该卡原句',
  Boolean(expectSentence) && norm(learnText).includes(norm(expectSentence)),
  `期望：${norm(expectSentence).slice(0, 60)}`,
)
check(
  '学习页渲染出中文释义',
  Boolean(expectTranslation) && norm(learnText).includes(norm(expectTranslation)),
  learnText.slice(0, 160),
)
check('学习页显示跟读环节标签', learnText.includes('跟读'), learnText.slice(0, 120))

// ---------- 8. 卡片不存在时的错误态 ----------
console.log('\n[8] 卡片不存在 → 错误态（不是白屏）')
await goto('/learn/no-such-card-xyz', 600)
await waitFor(async () => {
  const t = await bodyText()
  return t.includes('不存在') || t.includes('未找到')
})
const missingText = await bodyText()
check(
  '不存在的卡片给出提示而不是空白页',
  missingText.includes('不存在') || missingText.includes('未找到'),
  missingText.slice(0, 160),
)

// ---------- 9. 学习记录页接真实接口 ----------
console.log('\n[9] 学习记录页接 GET /api/history')
await goto('/history', 600)
await waitFor(async () => (await bodyText()).includes('连续学习天数'))
const histText = await bodyText()
check('记录页渲染出连续学习天数', histText.includes('连续学习天数'), histText.slice(0, 160))
check('记录页渲染出本月学习卡片', histText.includes('本月学习卡片'))
check('记录页渲染出累计学习卡片', histText.includes('累计学习卡片'))
check(
  '周趋势图固定 7 根柱子（周一→周日）',
  (await evaluate(`document.querySelectorAll('.ds-bars .ds-bar-col').length`)) === 7,
  String(await evaluate(`document.querySelectorAll('.ds-bars .ds-bar-col').length`)),
)
check('新账号显示空态「还没有练习记录」', histText.includes('还没有练习记录'), histText.slice(0, 200))

const lsKeys2 = await dailyspeakKeys()
check('浏览完整链路后 localStorage 依然干净', (lsKeys2 ?? []).length === 0, JSON.stringify(lsKeys2))

// ---------- 10. 内容不足时的跨领域补齐与告警（PRD 09） ----------
console.log('\n[10] 内容不足 → 跨领域补齐 + 告警条')
// 前置：把计划改成「只学计算机/IT，每天 10 条」。该领域只有 4 张卡，
// 剩下 6 条必须从「职场通用」补齐，并给出告警。
const okProfile = await restWrite(`user_profiles?user_id=eq.${userId}`, 'PATCH', {
  daily_count: 10,
  domains: ['计算机/IT'],
})
const okPlan = await restWrite(`today_plan?user_id=eq.${userId}`, 'DELETE')
check('前置：已把计划改为「计算机/IT + 每天 10 条」', okProfile && okPlan)

await goto('/', 900)
await waitFor(async () => (await evaluate(`document.querySelectorAll('article.ds-card').length`)) === 10)

const alertCards = await evaluate(`document.querySelectorAll('article.ds-card').length`)
const alertBanners = await evaluate(`document.querySelectorAll('.ds-alert').length`)
const alertText = await bodyText()
check('新快照按新计划重新生成（条数补足到 10）', alertCards === 10, `渲染 ${alertCards} 张`)
check('出现内容不足告警条', alertBanners === 1, `告警条 ${alertBanners} 个`)
check(
  '告警文案说明已从其他领域补充（PRD 09）',
  alertText.includes('其他领域'),
  alertText.slice(0, 200),
)

// ---------- 11. 登出 ----------
console.log('\n[11] 登出')
await goto('/')
check('回到学习台', (await evaluate('location.pathname')) === '/', await evaluate('location.pathname'))
await waitFor(async () => (await bodyText()).includes('退出'))
check('点击退出', (await clickByText('退出')) === 'CLICKED')
const afterLogout = await waitForPath('/login')
check('登出后回到登录页', afterLogout === '/login', afterLogout)

await goto('/')
check('登出后访问 / 又被挡回', (await evaluate('location.pathname')) === '/login', await evaluate('location.pathname'))

console.log(`\n结果：${pass} passed, ${fail} failed\n`)
ws.close()
process.exit(fail === 0 ? 0 : 1)
