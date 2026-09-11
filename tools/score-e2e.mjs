/**
 * P2 评分链路端到端验收（真实第三方，不 mock）
 *
 * 用真实的 16kHz WAV 打真实的接口：腾讯云 ASR 转写 → 词级比对 → DeepSeek 四维评测
 * → 落库 → 推复习排期，然后**回查数据库**核对每一环。
 *
 * 前置：
 *   1. npm run db:up
 *   2. npm run dev:api（或 build 后 node dist/main）
 *   3. apps/api/.env 里配好 DEEPSEEK_* 与 TENCENT_*
 *   4. 音频必须是 16kHz 单声道 16-bit PCM WAV（见 tools/README.md 的生成方法）
 * 运行：
 *   node --env-file=apps/api/.env tools/score-e2e.mjs <cardId> <repeat.wav> <answer.wav>
 */
import { readFileSync } from 'node:fs'

const API = process.env.API_BASE ?? 'http://127.0.0.1:3000'
const SUPABASE_URL = process.env.SUPABASE_URL
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY
const SECRET = process.env.SUPABASE_SECRET_KEY

const [cardId, repeatWavPath, answerWavPath] = process.argv.slice(2)

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
  console.error('缺少 SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY')
  process.exit(1)
}
if (!cardId || !repeatWavPath || !answerWavPath) {
  console.error('用法：node --env-file=apps/api/.env tools/score-e2e.mjs <cardId> <repeat.wav> <answer.wav>')
  process.exit(1)
}

async function req(method, url, { token, apikey, body, form } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      ...(form ? {} : { 'content-type': 'application/json' }),
      ...(apikey ? { apikey } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* 非 JSON */
  }
  return { status: res.status, json, text }
}

const authUrl = (p) => `${SUPABASE_URL}/auth/v1${p}`

/** 走 Supabase REST 直接查库核对（不信接口自报） */
async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SECRET, authorization: `Bearer ${SECRET}` },
  })
  return res.json()
}

/** 组装 multipart：字段名必须是 audio */
function audioForm(bytes, filename) {
  const form = new FormData()
  form.append('audio', new Blob([bytes], { type: 'audio/wav' }), filename)
  form.append('cardId', cardId)
  return form
}

/** 发一段合法 WAV 头但内容是静音的音频（用于验证「没识别到内容」的分支） */
function silentWav(seconds) {
  const rate = 16000
  const dataLen = rate * 2 * seconds
  const buf = Buffer.alloc(44 + dataLen)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataLen, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(rate, 24)
  buf.writeUInt32LE(rate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataLen, 40)
  return buf
}

function wavSeconds(bytes) {
  // 逐块走，别硬读偏移 40：SAPI 用 18 字节 fmt 块，data 在偏移 38
  let offset = 12
  let rate = 16000
  let channels = 1
  let bits = 16
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4)
    const size = bytes.readUInt32LE(offset + 4)
    const body = offset + 8
    if (id === 'fmt ') {
      channels = bytes.readUInt16LE(body + 2)
      rate = bytes.readUInt32LE(body + 4)
      bits = bytes.readUInt16LE(body + 14)
    } else if (id === 'data') {
      return size / (rate * channels * (bits / 8))
    }
    offset = body + size + (size % 2)
  }
  return 0
}

const repeatWav = readFileSync(repeatWavPath)
const answerWav = readFileSync(answerWavPath)
console.log(`卡片 ${cardId}`)
console.log(`跟读音频 ${wavSeconds(repeatWav).toFixed(1)}s ｜ 应答音频 ${wavSeconds(answerWav).toFixed(1)}s`)

// ---------- 准备账号 ----------
const email = `score_${Date.now()}_${Math.floor(Math.random() * 1e4)}@example.com`
const password = 'ScoreTest1234'
const created = await req('POST', `${SUPABASE_URL}/auth/v1/admin/users`, {
  apikey: SECRET,
  token: SECRET,
  body: { email, password, email_confirm: true },
})
const userId = created.json?.id
if (!userId) {
  console.error('创建测试账号失败：', created.status, created.text.slice(0, 200))
  process.exit(1)
}
const login = await req('POST', authUrl('/token?grant_type=password'), {
  apikey: PUBLISHABLE,
  body: { email, password },
})
const token = login.json?.access_token
if (!token) {
  console.error('登录失败：', login.status, login.text.slice(0, 200))
  process.exit(1)
}
console.log(`测试账号 ${email}`)

await req('PUT', `${API}/api/profile`, {
  token,
  // 每日条数拉满 10：内容库正好 10 张，这样今日快照必然包含被测卡片，
  // 后面的「学习台步骤标记」断言才是确定性的（否则随机排卡会漏掉它）
  body: { domains: ['职场通用', '计算机/IT'], dailyCount: 10 },
})

// 按真实使用顺序：**先打开学习台拿到今日任务，再去练**。
// 反过来做（练完再生成快照）会踩到 PRD 5.3「已掌握的卡不再作为新句推送」，
// 卡片根本不会出现在快照里——那是正确行为，不是 bug。
const planBefore = await req('GET', `${API}/api/today`, { token })
const plannedIds = (planBefore.json?.cards ?? []).map((c) => c.card?.id)
console.log(`今日快照 ${plannedIds.length} 张，含被测卡片：${plannedIds.includes(cardId)}`)
if (!plannedIds.includes(cardId)) {
  console.error('被测卡片不在今日快照里，后续断言无意义，请把 daily_count 调到覆盖全部内容')
  process.exit(1)
}

// ---------- 1. 鉴权与参数校验 ----------
console.log('\n[1] 边界校验')
const anon = await req('POST', `${API}/api/score/repeat`, { form: audioForm(repeatWav, 'r.wav') })
check('无令牌 → 401', anon.status === 401, `status=${anon.status}`)

const noAudio = await req('POST', `${API}/api/score/repeat`, { token, body: { cardId } })
check('没有音频文件 → 400 且有中文提示', noAudio.status === 400 && /上传音频/.test(noAudio.text), noAudio.text.slice(0, 160))

const wrongCard = await req('POST', `${API}/api/score/repeat`, {
  token,
  form: (() => {
    const f = new FormData()
    f.append('audio', new Blob([repeatWav], { type: 'audio/wav' }), 'r.wav')
    f.append('cardId', 'no-such-card')
    return f
  })(),
})
check('卡片不存在 → 404', wrongCard.status === 404, `status=${wrongCard.status}`)

const tooShort = await req('POST', `${API}/api/score/repeat`, {
  token,
  form: audioForm(silentWav(1), 'short.wav'),
})
check(
  '跟读不足 3 秒 → 400 且说明实际秒数',
  tooShort.status === 400 && /至少要说满 3 秒/.test(tooShort.text),
  tooShort.text.slice(0, 160),
)

const notWav = await req('POST', `${API}/api/score/repeat`, {
  token,
  form: (() => {
    const f = new FormData()
    // 长度要超过 44 字节，否则会先撞上「数据不完整」，测不到 RIFF 校验这一层
    f.append('audio', new Blob([Buffer.alloc(2048, 0x41)], { type: 'audio/wav' }), 'x.wav')
    f.append('cardId', cardId)
    return f
  })(),
})
check('不是 WAV → 400 且提示格式不受支持', notWav.status === 400 && /格式不受支持/.test(notWav.text), notWav.text.slice(0, 160))

// ---------- 2. 跟读评测（真实 ASR） ----------
console.log('\n[2] 跟读评测（POST /api/score/repeat，真实腾讯云 ASR）')
const repeatStarted = Date.now()
const repeat = await req('POST', `${API}/api/score/repeat`, {
  token,
  form: audioForm(repeatWav, 'repeat.wav'),
})
const repeatMs = Date.now() - repeatStarted
check('跟读评测返回 200', repeat.status === 200, `status=${repeat.status} ${repeat.text.slice(0, 200)}`)

const r = repeat.json
check('未降级', r?.degraded === false, JSON.stringify(r).slice(0, 160))
check('有分数的具体数值', typeof r?.score === 'number', String(r?.score))
check('分数在 40–98 之间', r?.score >= 40 && r?.score <= 98, String(r?.score))
check('带回了 ASR 转写文本', typeof r?.transcript === 'string' && r.transcript.length > 0, JSON.stringify(r?.transcript))
check('标注了转写供应商', r?.transcriptSource === 'tencent-asr', String(r?.transcriptSource))
check('带回了逐词对齐', Array.isArray(r?.alignment) && r.alignment.length > 0, `alignment ${r?.alignment?.length}`)
check('相似度是 0–1 的数', typeof r?.similarity === 'number' && r.similarity >= 0 && r.similarity <= 1, String(r?.similarity))
check('反馈来自词级 diff（非空）', Array.isArray(r?.feedback) && r.feedback.length > 0, JSON.stringify(r?.feedback))
console.log(`        耗时 ${repeatMs}ms ｜ 分数 ${r?.score} ｜ 相似度 ${(r?.similarity ?? 0).toFixed(3)}`)
console.log(`        识别到：「${r?.transcript}」`)

// 分数必须与相似度严格对应（D-008：没有任何随机扰动）
const expectedFromSimilarity = Math.min(98, Math.max(40, Math.round(52 + r.similarity * 46)))
check(
  '分数完全由相似度决定（可复算）',
  r?.score === expectedFromSimilarity,
  `${r?.score} vs 复算 ${expectedFromSimilarity}`,
)

// ---------- 3. 跟读结果落库 ----------
console.log('\n[3] 跟读结果落库')
const progressRows = await rest(`user_progress?select=repeat_score,answer_score,composite,mode&user_id=eq.${userId}&card_id=eq.${cardId}`)
const p1 = progressRows?.[0]
check('user_progress 已写入', Boolean(p1), JSON.stringify(progressRows))
check('repeat_score 与接口返回一致', p1?.repeat_score === r?.score, `${p1?.repeat_score} vs ${r?.score}`)
check('answer_score 仍为空（还没做应答）', p1?.answer_score === null, String(p1?.answer_score))
check('composite 仍为空', p1?.composite === null, String(p1?.composite))
check('mode 由服务端判定为新卡', p1?.mode === 'new', String(p1?.mode))

const scheduleAfterRepeat = await rest(`review_schedule?select=stage,times_reviewed&user_id=eq.${userId}&card_id=eq.${cardId}`)
check('跟读阶段不产生复习排期（D-006）', Array.isArray(scheduleAfterRepeat) && scheduleAfterRepeat.length === 0, JSON.stringify(scheduleAfterRepeat))

// ---------- 4. 情境应答评测（真实 DeepSeek） ----------
console.log('\n[4] 情境应答评测（POST /api/score/answer，真实 DeepSeek）')
const answerStarted = Date.now()
const answer = await req('POST', `${API}/api/score/answer`, {
  token,
  form: audioForm(answerWav, 'answer.wav'),
})
const answerMs = Date.now() - answerStarted
check('应答评测返回 200', answer.status === 200, `status=${answer.status} ${answer.text.slice(0, 200)}`)

const a = answer.json
check('未降级', a?.degraded === false, JSON.stringify(a).slice(0, 200))
check('有应答分', typeof a?.score === 'number', String(a?.score))
check('四个维度齐全且都是数字', ['content', 'grammar', 'fluency', 'vocabulary'].every((k) => typeof a?.dimensions?.[k] === 'number'), JSON.stringify(a?.dimensions))
check('维度分在 0–100', Object.values(a?.dimensions ?? {}).every((v) => v >= 0 && v <= 100), JSON.stringify(a?.dimensions))
check('有一句话改进建议', typeof a?.suggestion === 'string' && a.suggestion.length > 0, JSON.stringify(a?.suggestion))
check('带回 ASR 转写', typeof a?.transcript === 'string' && a.transcript.length > 0)
console.log(`        耗时 ${answerMs}ms ｜ 应答分 ${a?.score} ｜ 维度 ${JSON.stringify(a?.dimensions)}`)
console.log(`        建议：${a?.suggestion}`)

// 综合分按 PRD 5.5 复算
check('应答分 = 四维加权（可复算）', a?.score === Math.round(a.dimensions.content * 0.4 + a.dimensions.grammar * 0.25 + a.dimensions.fluency * 0.2 + a.dimensions.vocabulary * 0.15), String(a?.score))

// ---------- 5. 整卡完成：综合分 + 排期推进 ----------
console.log('\n[5] 整卡完成 → 综合分与复习排期')
const progress2 = await rest(`user_progress?select=repeat_score,answer_score,composite,mode&user_id=eq.${userId}&card_id=eq.${cardId}`)
const p2 = progress2?.[0]
check('answer_score 已写入且与接口一致', p2?.answer_score === a?.score, `${p2?.answer_score} vs ${a?.score}`)
// 综合分以**库里那一行为准**复算，而不是拿第一次响应去比——
// 后面 [7] 还会重复提交一次，而 LLM 评分本身有轻微不确定性
const dbComposite = p2?.composite
const recomputed = Math.round(p2.repeat_score * 0.5 + p2.answer_score * 0.5)
check('composite = 跟读×0.5 + 应答×0.5', dbComposite === recomputed, `${dbComposite} vs 复算 ${recomputed}`)
check('repeat_score 未被应答覆盖', p2?.repeat_score === r?.score, `${p2?.repeat_score} vs ${r?.score}`)
check('当天完成的卡 mode 记为新卡（排期次日才到期）', p2?.mode === 'new', String(p2?.mode))

const schedule = await rest(`review_schedule?select=stage,due_at,last_score,times_reviewed&user_id=eq.${userId}&card_id=eq.${cardId}`)
const s = schedule?.[0]
check('已生成复习排期', Boolean(s), JSON.stringify(schedule))
check('排期落在 S1（次日回顾）', s?.stage === 1, String(s?.stage))
check('排期的 last_score 是综合分', s?.last_score === dbComposite, `${s?.last_score} vs ${dbComposite}`)
const dueDate = s?.due_at ? new Date(s.due_at) : null
const tomorrow = new Date()
tomorrow.setDate(tomorrow.getDate() + 1)
check(
  '到期时间是次日 00:00（本地）',
  dueDate != null &&
    dueDate.getFullYear() === tomorrow.getFullYear() &&
    dueDate.getMonth() === tomorrow.getMonth() &&
    dueDate.getDate() === tomorrow.getDate() &&
    dueDate.getHours() === 0,
  String(s?.due_at),
)

// ---------- 6. 今日任务与历史跟着变 ----------
console.log('\n[6] 学习台与历史页的数据联动')
const today = await req('GET', `${API}/api/today`, { token })
const todayIds = (today.json?.cards ?? []).map((c) => c.card?.id)
const todayCard = today.json?.cards?.find((c) => c.card?.id === cardId)
check('该卡仍在今日任务里（练完不会从快照消失）', Boolean(todayCard), `今日 ${todayIds.length} 张`)
check(
  '今日快照当天固定不变（D-004）',
  todayIds.length === plannedIds.length && todayIds.every((id, i) => id === plannedIds[i]),
  `${JSON.stringify(todayIds)} vs ${JSON.stringify(plannedIds)}`,
)
check('步骤标记显示跟读已完成', todayCard?.repeatDone === true, JSON.stringify(todayCard))
check('步骤标记显示应答已完成', todayCard?.answerDone === true, JSON.stringify(todayCard))

const history = await req('GET', `${API}/api/history`, { token })
check('历史累计卡片数 +1', history.json?.totalCards === 1, String(history.json?.totalCards))
check('连续学习天数为 1（今天学过）', history.json?.streak === 1, String(history.json?.streak))
check('最近练习的分数是综合分', history.json?.recent?.[0]?.score === dbComposite, `${history.json?.recent?.[0]?.score} vs ${dbComposite}`)
check('本周趋势把今天算进去了', (history.json?.weekActivity ?? []).reduce((x, y) => x + y, 0) === 1, JSON.stringify(history.json?.weekActivity))

const detail = await req('GET', `${API}/api/cards/${cardId}`, { token })
check('卡片详情返回我的进度', detail.json?.progress?.composite === dbComposite, JSON.stringify(detail.json?.progress))
check('卡片详情返回我的复习阶段', detail.json?.review?.stage === 1, JSON.stringify(detail.json?.review))

// ---------- 7. 幂等：重复提交同张卡 ----------
console.log('\n[7] 幂等（重复提交同张卡，以最后一次有效提交为准）')
const again = await req('POST', `${API}/api/score/repeat`, { token, form: audioForm(repeatWav, 'repeat.wav') })
const progress3 = await rest(`user_progress?select=id,repeat_score&user_id=eq.${userId}&card_id=eq.${cardId}`)
check('重复提交不报错', again.status === 200, `status=${again.status}`)
check('跟读分完全一致（纯算法，无随机扰动）', again.json?.score === r?.score, `${again.json?.score} vs ${r?.score}`)
check('user_progress 仍只有一行（唯一键生效）', progress3?.length === 1, `行数 ${progress3?.length}`)

const answerAgain = await req('POST', `${API}/api/score/answer`, { token, form: audioForm(answerWav, 'answer.wav') })
const p4 = (await rest(`user_progress?select=repeat_score,answer_score,composite&user_id=eq.${userId}&card_id=eq.${cardId}`))?.[0]
check('重复应答提交仍返回 200', answerAgain.status === 200, `status=${answerAgain.status}`)
check(
  '应答分被最后一次提交覆盖（幂等语义）',
  p4?.answer_score === answerAgain.json?.score,
  `库里 ${p4?.answer_score} vs 响应 ${answerAgain.json?.score}`,
)
// LLM 有轻微不确定性：允许小幅波动，但不允许崩掉（NaN / 越界 / 0 分）
check(
  '重复评测的分数波动在合理范围（±10 分内）',
  Math.abs((answerAgain.json?.score ?? -99) - (a?.score ?? 0)) <= 10,
  `${a?.score} → ${answerAgain.json?.score}`,
)
check('重复提交后综合分仍然自洽', p4?.composite === Math.round(p4.repeat_score * 0.5 + p4.answer_score * 0.5), JSON.stringify(p4))
const schedule3 = await rest(`review_schedule?select=stage,times_reviewed&user_id=eq.${userId}&card_id=eq.${cardId}`)
check('再次完成整卡不会连跳阶段（排期未到期不推进）', schedule3?.[0]?.stage === 1, JSON.stringify(schedule3))
check('touched 次数没有被重复提交推高', schedule3?.[0]?.times_reviewed === 0, JSON.stringify(schedule3))

// ---------- 8. 无语音输入的降级判断 ----------
console.log('\n[8] 静音音频（能识别服务，但没听到内容）')
const silence = await req('POST', `${API}/api/score/repeat`, { token, form: audioForm(silentWav(5), 'silence.wav') })
check(
  '静音 → 400 提示没识别到内容（不是伪造 40 分）',
  silence.status === 400 && /没有识别到任何内容/.test(silence.text),
  `status=${silence.status} ${silence.text.slice(0, 160)}`,
)

console.log(`\n结果：${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
