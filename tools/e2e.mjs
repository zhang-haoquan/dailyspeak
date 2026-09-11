/**
 * 端到端行为校验（无依赖 CDP）
 * 走真实链路：学习台 → 跳过录音跟读 → 结果 → 情境应答 → 完成 → 回学习台
 * 用法：node tools/e2e.mjs [baseUrl]
 */
import { appendFileSync, writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const CDP = 'http://127.0.0.1:9222'
const LOG = 'e2e.log'
writeFileSync(LOG, '')
const log = (line) => {
  console.log(line)
  appendFileSync(LOG, line + '\n')
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  if (ok) {
    pass++
    log(`  PASS  ${name}`)
  } else {
    fail++
    log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`)
  }
}

const target = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
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
    const timer = setTimeout(() => log(`  !! TIMEOUT waiting for ${method} (id=${mid})`), 20000)
    pending.set(mid, {
      resolve: (v) => { clearTimeout(timer); resolve(v) },
      reject: (e) => { clearTimeout(timer); reject(e) },
    })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })

const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value
/** 等 React 真正渲染出内容（Vite 冷启动/首次编译可能超过 1s） */
async function waitForApp(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const len = await evaluate(`document.getElementById('root')?.innerHTML.length ?? 0`)
    if (len > 0) return true
    await sleep(150)
  }
  return false
}

const goto = async (path, wait = 900) => {
  log(`  .. goto ${path}`)
  await send('Page.navigate', { url: BASE + path })
  await sleep(wait)
  if (!(await waitForApp())) log(`  !! 页面未渲染：${path}`)
}
const text = () => evaluate(`document.body.innerText`)
const clickByText = (t) =>
  evaluate(`
    (() => {
      const el = [...document.querySelectorAll('button, a')].find(e => e.innerText.replace(/\\s+/g,' ').trim().includes(${JSON.stringify(t)}))
      if (!el) return 'NOT_FOUND'
      el.click()
      return 'CLICKED'
    })()
  `)

const clickBySelector = (sel) =>
  evaluate(`
    (() => {
      const el = document.querySelector(${JSON.stringify(sel)})
      if (!el) return 'NOT_FOUND'
      el.click()
      return 'CLICKED'
    })()
  `)

const readToday = () =>
  evaluate(`
    (() => {
      const t = document.body.innerText
      const m = t.match(/(\\d+)\\/(\\d+) 完成/)
      const cards = [...document.querySelectorAll('article.ds-card')].map(a => ({
        title: a.querySelector('h3')?.innerText ?? '',
        meta: a.querySelector('.ds-meta')?.innerText ?? '',
        steps: [...a.querySelectorAll('.ds-step-pill')].map(s => s.className.includes('done') ? 'done' : 'todo'),
      }))
      return JSON.stringify({ done: m ? Number(m[1]) : null, total: m ? Number(m[2]) : null, cards })
    })()
  `)

// ---------- 场景搭建：dailyCount=3，两张卡到期复习，无进度 ----------
await goto('/login')
await evaluate(`
  localStorage.clear()
  const now = new Date(); const iso = (d) => new Date(d).toISOString()
  localStorage.setItem('dailyspeak:users', JSON.stringify([{ id:'u1', account:'demo@dailyspeak.app', password:'Demo1234', createdAt: iso(now) }]))
  localStorage.setItem('dailyspeak:session', JSON.stringify({ userId:'u1' }))
  localStorage.setItem('dailyspeak:profile', JSON.stringify({ userId:'u1', domains:['计算机/IT','职场通用'], dailyCount:3, onboarded:true, createdAt: iso(now) }))
  localStorage.setItem('dailyspeak:reviews', JSON.stringify([
    { userId:'u1', cardId:'c01', stage:2, dueAt: iso(now), lastScore: 90, timesReviewed: 1 },
    { userId:'u1', cardId:'c02', stage:1, dueAt: iso(now), lastScore: 82, timesReviewed: 0 },
  ]))
  'ok'
`)

log('\n[1] 首次进入学习台：快照生成')
await goto('/')
let s = JSON.parse(await readToday())
check('今日任务共 3 条', s.total === 3, `total=${s.total}`)
check('进度为 0/3', s.done === 0, `done=${s.done}`)
check('1 条新句 + 2 条复习', s.cards.filter((c) => c.meta === '新句').length === 1 && s.cards.filter((c) => c.meta !== '新句').length === 2, JSON.stringify(s.cards.map((c) => c.meta)))
check('新句卡两步都未完成', s.cards.find((c) => c.meta === '新句')?.steps.join() === 'todo,todo')
const newCardTitle = s.cards.find((c) => c.meta === '新句')?.title
const planRaw = await evaluate(`localStorage.getItem('dailyspeak:todayPlan')`)
if (!planRaw) throw new Error('今日任务快照未生成，后续断言无法继续')
const planTasks = JSON.parse(planRaw).tasks
const newTaskId = planTasks.find((t) => t.type === 'new').cardId
log(`  .. 今日新句卡 = ${newTaskId}（${newCardTitle}）`)

log('\n[2] 只能跟读、未完成应答 → 卡片不能消失')
// 直接写入「只完成跟读」的进度，模拟用户答到一半离开
await evaluate(`
  const now = new Date()
  localStorage.setItem('dailyspeak:progress', JSON.stringify([
    { userId:'u1', cardId:${JSON.stringify(newTaskId)}, repeatScore: 85, answerScore: null, composite: null, doneAt: now.toISOString(), mode:'new' }
  ]))
  'ok'
`)
await goto('/')
s = JSON.parse(await readToday())
check('任务数仍为 3（未跳变）', s.total === 3, `total=${s.total}`)
check('未完成的卡仍在列表中', s.cards.some((c) => c.title === newCardTitle), JSON.stringify(s.cards.map((c) => c.title)))
check('进度仍为 0/3（跟读不算完成）', s.done === 0, `done=${s.done}`)
const partial = s.cards.find((c) => c.title === newCardTitle)
check('该卡显示「跟读完成 / 应答待做」', partial?.steps.join() === 'done,todo', partial?.steps.join())

log('\n[3] 完整走通一张新卡（跳过录音兜底链路）')
await goto('/')
await clickByText('开始练习')
await sleep(1500)
check('进入跟读页', (await evaluate('location.pathname')).startsWith('/learn/'), await evaluate('location.pathname'))
await clickByText('跳过录音')
await sleep(2600)
check('跟读完成进入结果页', (await evaluate('location.pathname')).startsWith('/result/'), await evaluate('location.pathname'))
await clickByText('进入情境应答')
await sleep(1600)
check('进入应答页', (await evaluate('location.pathname')).endsWith('/answer'), await evaluate('location.pathname'))
await clickByText('跳过录音')
await sleep(3200)
const answerResult = await text()
check('应答结果页出现维度评分', answerResult.includes('维度评分'), answerResult.slice(0, 80))
await clickByText('完成 · 返回学习台')
await sleep(1600)
check('回到学习台', (await evaluate('location.pathname')) === '/', await evaluate('location.pathname'))

s = JSON.parse(await readToday())
check('进度变为 1/3', s.done === 1, `done=${s.done}`)
check('任务数仍为 3', s.total === 3, `total=${s.total}`)
const finished = s.cards.find((c) => c.steps.join() === 'done,done')
check('完成的卡两步都标记完成', !!finished, JSON.stringify(s.cards))

log('\n[4] 完成新卡不影响其他卡的排期')
const readReviews = async () => JSON.parse(await evaluate(`localStorage.getItem('dailyspeak:reviews')`))
let reviews = await readReviews()
let c01 = reviews.find((r) => r.cardId === 'c01')
const c02 = reviews.find((r) => r.cardId === 'c02')
check('c01 未被新卡流程改动（仍为 S2）', c01?.stage === 2, `stage=${c01?.stage}`)
check('c02 未被改动（仍为 S1）', c02?.stage === 1, `stage=${c02?.stage}`)
const c03 = reviews.find((r) => r.cardId === newTaskId)
check('新完成的卡建立 S1 排期', c03?.stage === 1, `cardId=${newTaskId} stage=${c03?.stage}`)
check('新卡排期在明天到期（非今天）', c03 && new Date(c03.dueAt) > new Date(), c03?.dueAt)

log('\n[5] 完成一张到期复习卡：排期只推进一级')
await goto('/')
const beforeReview = JSON.parse(await readToday())
const reviewTitle = beforeReview.cards.find((c) => c.meta !== '新句')?.title
const c01Before = (await readReviews()).find((r) => r.cardId === 'c01')
await clickByText('开始练习')
await sleep(1500)
await clickByText('跳过录音')
await sleep(2600)
await clickByText('进入情境应答')
await sleep(1600)
await clickByText('跳过录音')
await sleep(3200)
await clickByText('完成 · 返回学习台')
await sleep(1600)
s = JSON.parse(await readToday())
check('进度变为 2/3', s.done === 2, `done=${s.done}`)
check('完成的复习卡仍留在今日列表', s.cards.some((c) => c.title === reviewTitle), JSON.stringify(s.cards.map((c) => c.title)))
check('今日任务总数仍为 3（未因复习完成而增加新句）', s.total === 3, `total=${s.total}`)
reviews = await readReviews()
c01 = reviews.find((r) => r.cardId === 'c01')
check(
  '复习卡阶段只动了 1 级（不会一次跳 2 级）',
  Math.abs(c01.stage - c01Before.stage) === 1,
  `S${c01Before.stage} -> S${c01.stage}`,
)
check('复习次数 +1', c01.timesReviewed === c01Before.timesReviewed + 1, `${c01Before.timesReviewed} -> ${c01.timesReviewed}`)
check('c02 仍未被连带推进', reviews.find((r) => r.cardId === 'c02')?.stage === 1)

log('\n[6] 历史页统计')
await goto('/history')
const hist = await text()
check('历史页渲染出统计与趋势图', hist.includes('学习记录') && hist.includes('本周学习进度'), hist.slice(0, 60))
const stats = JSON.parse(await evaluate(`
  (() => {
    const nums = [...document.querySelectorAll('.ds-stat .ds-gradient-text')].map(e => Number(e.innerText))
    const bars = [...document.querySelectorAll('.ds-bar')].map(e => e.title)
    return JSON.stringify({ streak: nums[0], monthCards: nums[1], totalCards: nums[2], bars })
  })()
`))
check('连续学习天数 = 1', stats.streak === 1, JSON.stringify(stats))
check('本月学习卡片 = 2', stats.monthCards === 2, JSON.stringify(stats))
check('累计学习卡片 = 2', stats.totalCards === 2, JSON.stringify(stats))
const todayIdx = (new Date().getDay() + 6) % 7 // 周一 = 0
check(
  `周趋势图「${stats.bars[todayIdx]?.slice(0, 1)}」有今天的 2 张卡`,
  /：2 张卡$/.test(stats.bars[todayIdx] ?? ''),
  JSON.stringify(stats.bars),
)
check('无数据的日子不画柱子', stats.bars.filter((b) => /：0 张卡/.test(b)).length > 0, JSON.stringify(stats.bars))

log('\n[7] 录音后回听自己的发音（回听链路 + 交接给结果页）')
await goto('/')
const learnTarget = JSON.parse(await readToday()).cards.find((c) => c.steps.join() === 'todo,todo')
check('还有未完成的卡可供录音', !!learnTarget, JSON.stringify(learnTarget))

// 直接进学习页（避开列表按钮的文案差异）
const cardId = planTasks.find((t) => t.type === 'review').cardId
await goto(`/learn/${cardId}?mode=review`)
check('学习页录音按钮存在', (await clickBySelector('.ds-mic-btn')) === 'CLICKED')
await sleep(1800)
check('正在录音', (await evaluate(`!!document.querySelector('.ds-mic-btn.is-recording')`)) === true)
await clickBySelector('.ds-mic-btn') // 停止
await sleep(1200)

check('录音后出现「听我的发音」按钮', (await evaluate(`!!document.querySelector('.ds-playback-btn')`)) === true)
check(
  '按钮文案正确',
  (await evaluate(`document.querySelector('.ds-playback-btn')?.innerText.trim()`)) === '听我的发音',
)

// 播放
await clickBySelector('.ds-playback-btn')
await sleep(900)
const playState = JSON.parse(await evaluate(`
  (() => {
    const a = document.querySelector('audio')
    return JSON.stringify({
      exists: !!a,
      isBlob: (a?.src ?? '').startsWith('blob:'),
      paused: a?.paused ?? null,
      currentTime: a?.currentTime ?? 0,
      duration: Number.isFinite(a?.duration) ? a.duration : null,
      label: document.querySelector('.ds-playback-btn')?.innerText.trim(),
    })
  })()
`))
check('生成了本地音频对象（blob:）', playState.isBlob, JSON.stringify(playState))
check('音频确实在播放', playState.paused === false, JSON.stringify(playState))
check('播放进度在推进', playState.currentTime > 0.2, JSON.stringify(playState))
check('录音时长被正确解析（>0.5s）', (playState.duration ?? 0) > 0.5, JSON.stringify(playState))
check('播放中按钮变为「播放中…」', playState.label === '播放中…', playState.label)

// 暂停
await clickBySelector('.ds-playback-btn')
await sleep(400)
check('再次点击可暂停', (await evaluate(`document.querySelector('audio')?.paused`)) === true)
check('暂停后按钮回到「听我的发音」', (await evaluate(`document.querySelector('.ds-playback-btn')?.innerText.trim()`)) === '听我的发音')

// 交接给结果页
await clickBySelector('.ds-btn-primary[type="button"]') // 完成 → 评测 → 结果页
await sleep(2600)
check('跟读完成进入结果页', (await evaluate('location.pathname')).startsWith('/result/'), await evaluate('location.pathname'))
const resultAudio = JSON.parse(await evaluate(`
  (() => {
    const btn = document.querySelector('.ds-playback-btn')
    return JSON.stringify({ hasButton: !!btn })
  })()
`))
check('结果页仍可回听本次录音（URL 未被回收）', resultAudio.hasButton === true, JSON.stringify(resultAudio))
await clickBySelector('.ds-playback-btn')
await sleep(700)
const resultPlay = JSON.parse(await evaluate(`
  (() => {
    const a = document.querySelector('audio')
    return JSON.stringify({ paused: a?.paused ?? null, currentTime: a?.currentTime ?? 0 })
  })()
`))
check('结果页音频可正常播放', resultPlay.paused === false && resultPlay.currentTime > 0, JSON.stringify(resultPlay))

log('\n[8] ASR 词级比对纯函数（直接加载 src/services/asr.ts 断言）')
const unitCases = JSON.parse(await evaluate(`
  (async () => {
    const asr = await import('/src/services/asr.ts')
    const cases = []
    const eq = (name, actual, expected) =>
      cases.push({ name, actual: JSON.stringify(actual), pass: JSON.stringify(actual) === JSON.stringify(expected) })

    const T = 'I led the refactoring of our payment module'
    eq('完全相同 → 相似度 1', asr.alignWords(T, T).similarity, 1)
    eq('漏词 → 相似度 0.75', asr.alignWords('I led the refactoring', 'I the refactoring').similarity, 0.75)
    eq('乱序/多词不影响原句覆盖', asr.alignWords('I led', 'well I led it').similarity, 1)

    const sub = asr.alignWords('I led the refactoring', 'I lead the refactoring')
    eq(
      '替换词被标出（led → lead）',
      sub.words.map((w) => [w.word, w.said, w.ok]),
      [['i','i',true],['led','lead',false],['the','the',true],['refactoring','refactoring',true]],
    )
    eq('替换后相似度 0.75', sub.similarity, 0.75)

    // 回归：贪心替换曾把后续所有正确词都带偏，导致准确度算成 0%
    const drop = asr.alignWords('could you walk me through your resume', 'you walk me through your')
    eq('开头漏词不会带偏后续匹配', [drop.matched, Math.round(drop.similarity * 100)], [5, 71])
    eq(
      '漏读的词 said 为 null（不是错配成后一个词）',
      drop.words.filter((w) => !w.ok).map((w) => w.word),
      ['could', 'resume'],
    )

    const miss = asr.alignWords('I led the refactoring', 'I led the')
    eq(
      '漏读词 said 为 null',
      miss.words.filter((w) => !w.ok).map((w) => [w.word, w.said]),
      [['refactoring', null]],
    )

    eq('大小写与标点不敏感', asr.alignWords('Experience.', 'experience').similarity, 1)
    eq('空转写 → 相似度 0', asr.alignWords(T, '').similarity, 0)
    eq('分词会去掉标点', asr.tokenize("I'm fine, thanks!"), ['i\\'m','fine','thanks'])

    const S = 'I am a software developer with three years of experience'
    eq('模拟转写可复现（同种子同结果）', asr.mockTranscript(S, 3000) === asr.mockTranscript(S, 3000), true)
    eq('不同种子结果不同', asr.mockTranscript(S, 3000) === asr.mockTranscript(S, 7000), false)
    eq('模拟转写不是照抄原句', asr.mockTranscript(S, 3000) !== S, true)
    eq('空目标句不炸', asr.mockTranscript('', 3000), '')

    return JSON.stringify(cases)
  })()
`))
for (const c of unitCases) check(c.name, c.pass, `actual=${c.actual}`)

log('\n[9] 跟读评分确实来自转写：录音 → 我听到的 → 逐词对照 → 分数')
await goto('/')
// 强制使用本地模拟转写，保证离线/无网环境下结果可复现
await evaluate(`localStorage.setItem('dailyspeak:asrProvider','mock'); 'ok'`)
const asrCardId = planTasks.find((t) => t.type === 'review').cardId
await goto(`/learn/${asrCardId}?mode=review`)
await clickBySelector('.ds-mic-btn')
await sleep(1800)
await clickBySelector('.ds-mic-btn') // 停止
await sleep(1500)

check('出现「我听到的」卡片', (await evaluate(`!!document.querySelector('.ds-heard-card')`)) === true)
check(
  '标注了转写来源',
  (await evaluate(`document.querySelector('.ds-asr-badge')?.innerText.trim()`)) === '模拟转写（演示）',
  await evaluate(`document.querySelector('.ds-asr-badge')?.innerText ?? 'null'`),
)
const heardText = await evaluate(`document.querySelector('.ds-heard-text')?.innerText.trim() ?? ''`)
check('回显了转写文本', heardText.length > 0, JSON.stringify(heardText))
check('逐词对照区存在', (await evaluate(`!!document.querySelector('.ds-heard-diff')`)) === true)
const diffWords = JSON.parse(await evaluate(`
  JSON.stringify([...document.querySelectorAll('.ds-heard-diff span')].map(s => ({ w: s.innerText, bad: s.classList.contains('is-bad') })))
`))
check('对照区逐词列出原句', diffWords.length >= 6, `共 ${diffWords.length} 个词`)
const diffText = (await evaluate(`document.querySelector('.ds-heard-diff')?.innerText ?? ''`)).trim()
check(
  '对照区的词没有被挤成一串（词间有空格）',
  diffText.split(/\s+/).length === diffWords.length,
  `innerText="${diffText}" 期望 ${diffWords.length} 个词`,
)
const accuracyText = await evaluate(`document.querySelector('.ds-heard-meta')?.innerText ?? ''`)
const accuracy = Number((accuracyText.match(/(\d+)%/) ?? [])[1])
check('显示词级准确度', Number.isFinite(accuracy), accuracyText)

// 完成 → 结果页，核对分数 = f(相似度)
await clickBySelector('.ds-btn-primary[type="button"]')
await sleep(2800)
check('进入结果页', (await evaluate('location.pathname')).startsWith('/result/'), await evaluate('location.pathname'))
const shownScore = Number(await evaluate(`document.querySelector('.score-ring-overlay span')?.innerText ?? 'NaN'`))
// scoring.ts: score = clamp(round(52 + similarity * 46), 40, 98)
const expectedScore = Math.min(98, Math.max(40, Math.round(52 + (accuracy / 100) * 46)))
check(
  `结果页分数 (${shownScore}) 来自词级相似度 (${accuracy}% → 期望 ${expectedScore})`,
  Math.abs(shownScore - expectedScore) <= 1,
  `shown=${shownScore} expected=${expectedScore}`,
)
check('结果页也展示「我听到的」', (await evaluate(`!!document.querySelector('.ds-heard-card')`)) === true)
const feedback = await evaluate(`document.body.innerText`)
check(
  '反馈内容与转写挂钩（提到具体词或说明估算）',
  /识别到|听成了|每个词都识别正确|估算/.test(feedback),
  feedback.slice(0, 120),
)

log(`\n结果：${pass} passed, ${fail} failed\n`)
ws.close()
process.exit(fail === 0 ? 0 : 1)



