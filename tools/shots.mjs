/**
 * 无依赖截图工具（Chrome DevTools Protocol）
 * 用法：先启动带 --remote-debugging-port=9222 的 Chrome，再 node tools/shots.mjs <baseUrl> <outDir>
 */
import { writeFileSync, mkdirSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const OUT = process.argv[3] ?? 'shots'
const CDP = 'http://127.0.0.1:9222'

mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const target = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})

let id = 0
const pending = new Map()
const events = []
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id !== undefined && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  } else if (msg.method) {
    events.push(msg.method)
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

async function goto(path, waitMs = 1500) {
  await send('Page.navigate', { url: BASE + path })
  await sleep(waitMs)
  // SPA 首屏偶发空白（渲染竞态）：重试一次
  const len = await evaluate(`document.getElementById('root').innerHTML.length`)
  if (!len) {
    await send('Page.reload', { ignoreCache: true })
    await sleep(waitMs + 800)
  }
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  return r.result?.value
}

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'))
  console.log('shot ->', `${OUT}/${name}.png`)
}

async function clickBySelector(sel) {
  return evaluate(`
    (() => {
      const el = document.querySelector(${JSON.stringify(sel)})
      if (!el) return 'NOT_FOUND'
      el.click()
      return 'CLICKED'
    })()
  `)
}

// ---------- 1. 未登录：登录 / 注册 ----------
await goto('/login')
// 清掉上一次运行留下的登录态，确保看到的是未登录视图
await evaluate(`localStorage.clear(); 'ok'`)
await goto('/login')
await shot('01-login')

// 切到注册模式
await evaluate(`
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('创建账号'))?.click()
`)
await sleep(500)
await shot('02-login-register')

// 触发校验错误（弱密码）
await evaluate(`
  const set = (el, v) => {
    const proto = Object.getPrototypeOf(el)
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const inputs = document.querySelectorAll('input')
  set(inputs[0], 'tester@dailyspeak.app')
  set(inputs[1], 'abc')
  set(inputs[2], 'abc')
  document.querySelector('form button[type=submit]').click()
`)
await sleep(1200)
await shot('03-login-error')

// ---------- 2. 注入演示数据后：引导 / 学习台 / 学习 / 应答 / 历史 ----------
const seed = `
  localStorage.clear()
  const now = new Date()
  const iso = (d) => new Date(d).toISOString()
  const key = (d) => {
    const p = (n) => String(n).padStart(2, '0')
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
  }
  localStorage.setItem('dailyspeak:users', JSON.stringify([
    { id: 'u1', account: 'demo@dailyspeak.app', password: 'Demo1234', createdAt: iso(now) }
  ]))
  localStorage.setItem('dailyspeak:session', JSON.stringify({ userId: 'u1' }))
  localStorage.setItem('dailyspeak:profile', JSON.stringify({
    userId: 'u1', domains: ['计算机/IT', '职场通用'], dailyCount: 3,
    onboarded: true, createdAt: iso(now)
  }))
  localStorage.setItem('dailyspeak:progress', JSON.stringify([
    { userId: 'u1', cardId: 'c05', repeatScore: 88, answerScore: 84, composite: 86, doneAt: iso(now), mode: 'new' },
    { userId: 'u1', cardId: 'c06', repeatScore: 91, answerScore: 89, composite: 90, doneAt: iso(new Date(Date.now() - 86400000)), mode: 'new' },
    { userId: 'u1', cardId: 'c07', repeatScore: 78, answerScore: 82, composite: 80, doneAt: iso(new Date(Date.now() - 2 * 86400000)), mode: 'new' }
  ]))
  localStorage.setItem('dailyspeak:reviews', JSON.stringify([
    { userId: 'u1', cardId: 'c01', stage: 2, dueAt: iso(now), lastScore: 90, timesReviewed: 1 },
    { userId: 'u1', cardId: 'c02', stage: 1, dueAt: iso(now), lastScore: 82, timesReviewed: 0 }
  ]))
  localStorage.setItem('dailyspeak:doneDays', JSON.stringify({ u1: [
    key(now),
    key(new Date(Date.now() - 86400000)),
    key(new Date(Date.now() - 2 * 86400000))
  ] }))
  'seeded'
`
await goto('/login')
await evaluate(seed)

await goto('/')
await shot('04-dashboard')

await goto('/history')
await shot('05-history')

await goto('/onboarding')
await shot('06-onboarding')

await goto('/learn/c03?mode=new')
await shot('07-learning')

// 录一段（需要 Chrome 带 --use-fake-device-for-media-stream），展示回听 + 转写回显
// 固定用本地模拟转写，截图结果可复现
await evaluate(`localStorage.setItem('dailyspeak:asrProvider','mock'); 'ok'`)
const recordClip = async () => {
  await clickBySelector('.ds-mic-btn')
  await sleep(1800)
  await clickBySelector('.ds-mic-btn')
  await sleep(1500)
}
await recordClip()
await evaluate(`document.querySelector('.ds-heard-card')?.scrollIntoView({ block: 'center' }); 'ok'`)
await sleep(400)
await shot('07b-learning-playback')

await goto('/learn/c03/answer?mode=new')
await shot('08-answer')
await recordClip()
await shot('08b-answer-playback')

await goto('/result/c03?mode=new')
await shot('09-result-no-score')

// 带分数的结果页：直接注入
await evaluate(`
  ((state) => {
    window.history.pushState({ usr: state }, '', '/result/c03?mode=new')
    window.dispatchEvent(new PopStateEvent('popstate', { state: { usr: state } }))
  })({ repeatScore: { score: 92, feedback: [
    { ok: true, text: '整体流利，语速和停顿都很自然' },
    { ok: false, text: '「payment」的 /t/ 发音偏弱，建议放慢重读一次' },
    { ok: true, text: '句子重音位置正确' }
  ], transcript: 'I led the refactoring of our payment module' } })
`)
await sleep(900)
await shot('10-result')

// 移动端登录页
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
})
await evaluate(`localStorage.removeItem('dailyspeak:session'); 'ok'`)
await goto('/login')
await shot('11-login-mobile')
await evaluate(`
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('创建账号'))?.click()
`)
await sleep(500)
await shot('12-login-mobile-register')

// 收集控制台错误
const errs = await evaluate(`JSON.stringify(window.__errs || [])`)
console.log('page errors:', errs)

ws.close()
console.log('done')
