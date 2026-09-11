/**
 * AI 供应商连通性自检（P2）
 *
 * 作用：在上线前 / 换密钥后，一条命令确认两家供应商**真的能用**——
 * 而不是等到用户点录音才发现密钥过期或没开权限。
 *
 * 检查内容：
 *   1. DeepSeek：发一次最小对话请求，要求它回一个词
 *   2. 腾讯云 ASR：发一段音频做一句话识别
 *      - 传入音频文件：真转写，并打印识别文本与耗时
 *      - 不传：发一段 1 秒静音，只验证鉴权与连通（不会有识别文本，属正常）
 *
 * 用法：
 *   node --env-file=apps/api/.env tools/providers-check.mjs
 *   node --env-file=apps/api/.env tools/providers-check.mjs path/to/16k-mono.wav
 */
import { readFileSync } from 'node:fs'

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY
const DEEPSEEK_BASE = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '')
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'

const SECRET_ID = process.env.TENCENT_SECRET_ID
const SECRET_KEY = process.env.TENCENT_SECRET_KEY
const REGION = process.env.TENCENT_ASR_REGION ?? 'ap-guangzhou'
const ENGINE = process.env.TENCENT_ASR_ENGINE ?? '16k_en'

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    pass++
    console.log(`  PASS  ${name}`)
  } else {
    fail++
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`)
  }
}

/** 生成一段 1 秒 16kHz 单声道 16-bit 的静音 WAV（仅用于验证鉴权连通） */
function silentWav(seconds = 1) {
  const sampleRate = 16000
  const dataLen = sampleRate * 2 * seconds
  const buf = Buffer.alloc(44 + dataLen)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataLen, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // 单声道
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataLen, 40)
  return buf // 静音：data 段全 0
}

async function checkDeepSeek() {
  console.log('\n[1] DeepSeek（LLM）')
  if (!DEEPSEEK_KEY) {
    check('DEEPSEEK_API_KEY 已配置', false, 'apps/api/.env 里为空')
    return
  }
  check('DEEPSEEK_API_KEY 已配置', true, `长度 ${DEEPSEEK_KEY.length}`)

  const started = Date.now()
  try {
    const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${DEEPSEEK_KEY}` },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: 'Reply with exactly one word: OK' }],
        // ⚠️ 不要给 8 这种小值：deepseek-flash / v4-pro 都是**推理模型**，
        // 推理 token 和正文共用这个预算。给小了会「HTTP 200 但 content 为空」，
        // 看起来像密钥或网络问题，其实是预算被推理吃光了。
        max_tokens: 256,
        temperature: 0,
      }),
    })
    const text = await res.text()
    const ms = Date.now() - started
    if (!res.ok) {
      check('对话请求成功', false, `HTTP ${res.status} ${text.slice(0, 160)}`)
      return
    }
    const json = JSON.parse(text)
    const content = json?.choices?.[0]?.message?.content ?? ''
    check('对话请求成功', true)
    check('返回了非空文本', String(content).trim().length > 0, JSON.stringify(content).slice(0, 80))
    console.log(`        模型 ${json?.model ?? DEEPSEEK_MODEL} ｜ 耗时 ${ms}ms ｜ 用量 ${JSON.stringify(json?.usage ?? {})}`)
  } catch (err) {
    check('对话请求成功', false, String(err?.message ?? err))
  }
}

async function checkTencentAsr(audioPath) {
  console.log('\n[2] 腾讯云 ASR（一句话识别）')
  if (!SECRET_ID || !SECRET_KEY) {
    check('TENCENT_SECRET_ID / TENCENT_SECRET_KEY 已配置', false, 'apps/api/.env 里为空')
    return
  }
  check('腾讯云密钥已配置', true, `SecretId 长度 ${SECRET_ID.length}`)

  let audio
  let source
  if (audioPath) {
    try {
      audio = readFileSync(audioPath)
      source = audioPath
    } catch (err) {
      check(`读取音频 ${audioPath}`, false, String(err?.message ?? err))
      return
    }
  } else {
    audio = silentWav(1)
    source = '内置 1 秒静音（只验鉴权）'
  }

  const base64 = audio.toString('base64')
  check('音频在接口限制内（base64 ≤ 3MB）', Buffer.byteLength(base64) <= 3 * 1024 * 1024,
    `${(Buffer.byteLength(base64) / 1024).toFixed(1)} KB`)
  console.log(`        音频来源：${source} ｜ 原始 ${(audio.length / 1024).toFixed(1)} KB`)

  const started = Date.now()
  try {
    // 动态 import：让「没装 SDK」也能给出人话错误，而不是模块加载就崩
    const tencentcloud = await import('tencentcloud-sdk-nodejs-asr')
    const AsrClient = (tencentcloud.default ?? tencentcloud).asr.v20190614.Client
    const client = new AsrClient({
      credential: { secretId: SECRET_ID, secretKey: SECRET_KEY },
      region: REGION,
      profile: { httpProfile: { endpoint: 'asr.tencentcloudapi.com', reqTimeout: 20 } },
    })

    const rep = await client.SentenceRecognition({
      EngSerViceType: ENGINE,
      SourceType: 1,
      VoiceFormat: 'wav',
      Data: base64,
      DataLen: audio.length,
    })
    const ms = Date.now() - started

    check('一句话识别调用成功', true)
    console.log(`        引擎 ${ENGINE} ｜ 耗时 ${ms}ms ｜ 音频时长 ${rep?.AudioDuration ?? '?'}ms`)
    console.log(`        识别结果：${JSON.stringify(rep?.Result ?? '')}`)
    if (audioPath) {
      check('有音频时识别出文本', String(rep?.Result ?? '').trim().length > 0,
        '静音或口音过重都可能返回空文本')
    } else {
      console.log('        （静音输入返回空文本是正常的，只说明鉴权与连通 OK）')
    }
  } catch (err) {
    const msg = String(err?.message ?? err)
    check('一句话识别调用成功', false, msg.slice(0, 200))
    console.log(`        RequestId: ${err?.requestId ?? '-'}`)
  }
}

console.log('DailySpeak · AI 供应商自检')
await checkDeepSeek()
await checkTencentAsr(process.argv[2])

console.log(`\n结果：${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
