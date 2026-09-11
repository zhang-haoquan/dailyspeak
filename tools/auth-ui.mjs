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

async function waitForApp(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const len = await evaluate(`document.getElementById('root')?.innerHTML.length ?? 0`)
    if (len > 0) return true
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
check('学习台渲染出今日任务', dashText.includes('今日学习进度'), dashText.slice(0, 120))
check('学习台不再出现登录表单', !dashText.includes('欢迎回来'), dashText.slice(0, 120))

// ---------- 5. 直接访问 /login 会被带回 ----------
console.log('\n[5] 已登录时访问 /login 自动跳走')
await goto('/login')
await sleep(800)
check('已登录用户不会停在登录页', (await evaluate('location.pathname')) !== '/login', await evaluate('location.pathname'))

// ---------- 6. 登出 ----------
console.log('\n[6] 登出')
await goto('/learn/c01')
check('进入学习页', (await evaluate('location.pathname')).startsWith('/learn/'), await evaluate('location.pathname'))
check('点击退出', (await clickByText('退出')) === 'CLICKED')
const afterLogout = await waitForPath('/login')
check('登出后回到登录页', afterLogout === '/login', afterLogout)

await goto('/')
check('登出后访问 / 又被挡回', (await evaluate('location.pathname')) === '/login', await evaluate('location.pathname'))

console.log(`\n结果：${pass} passed, ${fail} failed\n`)
ws.close()
process.exit(fail === 0 ? 0 : 1)
