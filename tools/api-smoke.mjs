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

/** 本地日期键 YYYY-MM-DD，与服务端 formatDateKey 口径一致 */
function localDateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

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

  console.log('\n[9] 卡片详情 GET /api/cards/:id')
  const cardRes = await req('GET', `${API}/api/cards/c01`, { token: accessToken })
  check('已上线卡片可读', cardRes.status === 200, `status=${cardRes.status} ${cardRes.text.slice(0, 140)}`)
  check(
    '返回跟读原句与中文释义',
    typeof cardRes.json?.card?.sentence === 'string' &&
      cardRes.json.card.sentence.length > 0 &&
      typeof cardRes.json?.card?.translation === 'string',
    JSON.stringify(cardRes.json?.card)?.slice(0, 160),
  )
  check('返回情境应答提问', typeof cardRes.json?.card?.prompt === 'string' && cardRes.json.card.prompt.length > 0)
  check('未学过时 progress 为 null', cardRes.json?.progress === null, JSON.stringify(cardRes.json?.progress))
  check('未入复习队列时 review 为 null', cardRes.json?.review === null, JSON.stringify(cardRes.json?.review))
  check(
    '不下发审核字段（status / createdAt）',
    cardRes.json?.card?.status === undefined && cardRes.json?.card?.createdAt === undefined,
    JSON.stringify(Object.keys(cardRes.json?.card ?? {})),
  )

  const missingCard = await req('GET', `${API}/api/cards/no-such-card`, { token: accessToken })
  check('不存在的卡片 → 404', missingCard.status === 404, `status=${missingCard.status}`)
  check(
    '404 使用统一错误体 { code, message }',
    missingCard.json?.code === 'NOT_FOUND' && typeof missingCard.json?.message === 'string',
    JSON.stringify(missingCard.json),
  )

  const anonCard = await req('GET', `${API}/api/cards/c01`)
  check('无令牌读卡片 → 401', anonCard.status === 401, `status=${anonCard.status}`)
  check('401 错误码为 UNAUTHORIZED', anonCard.json?.code === 'UNAUTHORIZED', JSON.stringify(anonCard.json))

  console.log('\n[10] 今日任务 GET /api/today')
  const today1 = await req('GET', `${API}/api/today`, { token: accessToken })
  check('今日任务可读', today1.status === 200, `status=${today1.status} ${today1.text.slice(0, 160)}`)
  check('dateKey 为本地日期', today1.json?.dateKey === localDateKey(), `${today1.json?.dateKey} vs ${localDateKey()}`)
  check('卡片数等于每日条数（默认 3）', today1.json?.cards?.length === 3, String(today1.json?.cards?.length))
  check(
    '每张卡都带完整内容（不是只给 id）',
    today1.json?.cards?.every((c) => c.card?.sentence && c.card?.prompt && c.card?.translation),
  )
  check('新账号无到期复习卡，全部为新句', today1.json?.cards?.every((c) => c.type === 'new'))
  check(
    '步骤标记初始为未完成',
    today1.json?.cards?.every((c) => c.repeatDone === false && c.answerDone === false),
  )
  check('内容充足时不产生告警', today1.json?.contentWarning === null, String(today1.json?.contentWarning))

  const today2 = await req('GET', `${API}/api/today`, { token: accessToken })
  check(
    '当天重复请求返回同一份快照（顺序也一致）',
    JSON.stringify(today2.json?.cards?.map((c) => c.card.id)) ===
      JSON.stringify(today1.json?.cards?.map((c) => c.card.id)),
    `${JSON.stringify(today2.json?.cards?.map((c) => c.card.id))}`,
  )

  console.log('\n[11] 修改学习计划 → 今日快照作废并重新生成（D-004）')
  const savedProfile = await req('PUT', `${API}/api/profile`, {
    token: accessToken,
    body: { domains: ['计算机/IT'], dailyCount: 1 },
  })
  check('保存学习计划成功', savedProfile.status === 200, `status=${savedProfile.status} ${savedProfile.text.slice(0, 140)}`)
  check('onboarded 置为 true', savedProfile.json?.onboarded === true)

  const today3 = await req('GET', `${API}/api/today`, { token: accessToken })
  check('快照按新的每日条数重新生成', today3.json?.cards?.length === 1, String(today3.json?.cards?.length))
  check('新快照只含已选领域', today3.json?.cards?.[0]?.card?.domain === '计算机/IT', today3.json?.cards?.[0]?.card?.domain)
  check('dailyCount 随快照返回', today3.json?.dailyCount === 1, String(today3.json?.dailyCount))

  console.log('\n[12] 历史统计 GET /api/history')
  const history = await req('GET', `${API}/api/history`, { token: accessToken })
  check('历史统计可读', history.status === 200, `status=${history.status} ${history.text.slice(0, 140)}`)
  check('新账号连续天数为 0', history.json?.streak === 0, String(history.json?.streak))
  check('新账号本月卡片为 0', history.json?.monthCards === 0, String(history.json?.monthCards))
  check('新账号累计卡片为 0', history.json?.totalCards === 0, String(history.json?.totalCards))
  check(
    '周趋势固定 7 个桶（周一→周日）',
    Array.isArray(history.json?.weekActivity) && history.json.weekActivity.length === 7,
    JSON.stringify(history.json?.weekActivity),
  )
  check('最近练习为空数组', Array.isArray(history.json?.recent) && history.json.recent.length === 0, JSON.stringify(history.json?.recent))

  const anonHistory = await req('GET', `${API}/api/history`)
  check('无令牌读历史 → 401', anonHistory.status === 401, `status=${anonHistory.status}`)

  console.log('\n[13] 统一校验错误格式（D-030）')
  const badDaily = await req('PUT', `${API}/api/profile`, {
    token: accessToken,
    body: { domains: ['计算机/IT'], dailyCount: 'abc' },
  })
  check('非整数每日条数 → 400', badDaily.status === 400, `status=${badDaily.status}`)
  check('错误码为 VALIDATION_FAILED', badDaily.json?.code === 'VALIDATION_FAILED', JSON.stringify(badDaily.json))
  check(
    'details 精确到字段名',
    typeof badDaily.json?.details?.dailyCount === 'string',
    JSON.stringify(badDaily.json?.details),
  )

  const unknownField = await req('PUT', `${API}/api/profile`, {
    token: accessToken,
    body: { domains: ['计算机/IT'], dailyCount: 3, isAdmin: true },
  })
  check('未声明字段被拒绝（forbidNonWhitelisted）', unknownField.status === 400, `status=${unknownField.status}`)

  const emptyDomains = await req('PUT', `${API}/api/profile`, {
    token: accessToken,
    body: { domains: [], dailyCount: 3 },
  })
  check(
    '空领域数组 → 400 且 details.domains 有提示',
    emptyDomains.status === 400 && typeof emptyDomains.json?.details?.domains === 'string',
    JSON.stringify(emptyDomains.json),
  )

  const unavailableDomain = await req('PUT', `${API}/api/profile`, {
    token: accessToken,
    body: { domains: ['金融'], dailyCount: 3 },
  })
  check('暂无内容的领域被拒绝（A-12）', unavailableDomain.status === 400, `status=${unavailableDomain.status}`)

  console.log(`\n结果：${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('冒烟测试异常：', err)
  process.exit(1)
})
