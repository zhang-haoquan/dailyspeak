/**
 * API 冒烟测试（P1 S2 验收）
 *
 * 覆盖：@Public 放行、无令牌拒绝、注册、邮箱确认、登录、带令牌访问、画像自动创建、错误令牌拒绝、重复邮箱。
 *
 * 前置：
 *   1. npm run db:up          （本地 Supabase）
 *   2. npm run dev:api        （后端 :3000）
 * 运行：
 *   npm run smoke
 */
const API = process.env.API_BASE ?? 'http://127.0.0.1:3000'

const SUPABASE_URL = process.env.SUPABASE_URL
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY
const SECRET = process.env.SUPABASE_SECRET_KEY

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

async function req(method, url, { token, apikey, body, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(apikey ? { apikey } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* 非 JSON 响应 */
  }
  return { status: res.status, json, text }
}

const authUrl = (path) => `${SUPABASE_URL}/auth/v1${path}`

async function main() {
  if (!SUPABASE_URL || !PUBLISHABLE || !SECRET) {
    console.error('缺少 SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY')
    process.exit(1)
  }

  const email = `smoke_${Date.now()}_${Math.floor(Math.random() * 1e4)}@example.com`
  const password = 'Smoke1234'

  console.log('\n[1] 健康检查与鉴权边界')
  const health = await req('GET', `${API}/api/health`)
  check('/api/health 免登录可访问（@Public 生效）', health.status === 200, `status=${health.status}`)
  check('健康检查报告数据库连通', health.json?.db === true, JSON.stringify(health.json))

  const noToken = await req('GET', `${API}/api/auth/me`)
  check('无令牌访问 /api/auth/me → 401', noToken.status === 401, `status=${noToken.status}`)

  const badToken = await req('GET', `${API}/api/auth/me`, { token: 'not-a-real-token' })
  check('伪造令牌 → 401', badToken.status === 401, `status=${badToken.status}`)

  console.log('\n[2] 注册（邮箱确认开启）')
  const signup = await req('POST', authUrl('/signup'), {
    apikey: PUBLISHABLE,
    body: { email, password },
  })
  check('注册成功', signup.status === 200, `status=${signup.status} ${signup.text.slice(0, 120)}`)
  const userId = signup.json?.id ?? signup.json?.user?.id
  check('返回了用户 id', Boolean(userId), JSON.stringify(signup.json).slice(0, 160))
  check(
    '开启邮箱确认后注册不直接给会话',
    !signup.json?.access_token,
    signup.json?.access_token ? '意外地直接返回了 token' : '',
  )

  console.log('\n[3] 未确认邮箱不能登录')
  const beforeConfirm = await req('POST', authUrl('/token?grant_type=password'), {
    apikey: PUBLISHABLE,
    body: { email, password },
  })
  check('未确认邮箱登录被拒', beforeConfirm.status >= 400, `status=${beforeConfirm.status}`)

  console.log('\n[4] 模拟点击邮件链接完成确认')
  const confirm = await req('PUT', authUrl(`/admin/users/${userId}`), {
    apikey: SECRET,
    token: SECRET,
    body: { email_confirm: true },
  })
  check('管理员确认邮箱成功', confirm.status === 200, `status=${confirm.status} ${confirm.text.slice(0, 120)}`)

  console.log('\n[5] 登录并访问受保护接口')
  const login = await req('POST', authUrl('/token?grant_type=password'), {
    apikey: PUBLISHABLE,
    body: { email, password },
  })
  check('登录成功', login.status === 200, `status=${login.status} ${login.text.slice(0, 120)}`)
  const accessToken = login.json?.access_token
  check('拿到 access_token', Boolean(accessToken))

  const me = await req('GET', `${API}/api/auth/me`, { token: accessToken })
  check('带令牌访问 /api/auth/me → 200', me.status === 200, `status=${me.status} ${me.text.slice(0, 160)}`)
  check('返回的用户 id 与注册一致', me.json?.user?.id === userId, `${me.json?.user?.id} vs ${userId}`)
  check('返回的邮箱一致', me.json?.user?.email === email, me.json?.user?.email)
  check('邮箱已验证标记为真', me.json?.user?.emailVerified === true, String(me.json?.user?.emailVerified))

  console.log('\n[6] 注册后画像自动创建（DB 触发器）')
  const profile = me.json?.profile
  check('profile 存在', Boolean(profile), JSON.stringify(me.json).slice(0, 200))
  check('profile.userId 正确', profile?.userId === userId, profile?.userId)
  check('onboarded 初始为 false（应进入首次引导）', profile?.onboarded === false, String(profile?.onboarded))
  check('dailyCount 默认 3', profile?.dailyCount === 3, String(profile?.dailyCount))
  check('domains 初始为空', Array.isArray(profile?.domains) && profile.domains.length === 0, JSON.stringify(profile?.domains))

  console.log('\n[7] 幂等：再次访问不会重复建 profile')
  const me2 = await req('GET', `${API}/api/auth/me`, { token: accessToken })
  check('profile.createdAt 未变化（同一条记录）', me2.json?.profile?.createdAt === profile?.createdAt,
    `${me2.json?.profile?.createdAt} vs ${profile?.createdAt}`)

  console.log('\n[8] 重复邮箱注册被拒')
  const dup = await req('POST', authUrl('/signup'), {
    apikey: PUBLISHABLE,
    body: { email, password },
  })
  const dupRejected =
    dup.status >= 400 ||
    dup.json?.id === undefined ||
    (Array.isArray(dup.json?.identities) && dup.json.identities.length === 0) ||
    dup.json?.user === null
  check('重复邮箱不会创建新账号', dupRejected, `status=${dup.status} ${dup.text.slice(0, 140)}`)

  console.log(`\n结果：${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('冒烟测试异常：', err)
  process.exit(1)
})
