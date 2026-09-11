/**
 * WAV 解析与时长校验单测（PRD 09 章「音频约束」）
 *
 * 这一层是**准入条件**：客户端可以随便上报一个 durationMs 绕过时长限制，
 * 所以必须由服务端解析音频本体来判定。
 */
import { InvalidAudioError, assertDuration, parseWavHeader } from './wav'

/** 造一段标准 44 字节头的 PCM WAV */
function makeWav(opts: {
  sampleRate?: number
  channels?: number
  bitsPerSample?: number
  seconds?: number
  silent?: boolean
} = {}): Buffer {
  const sampleRate = opts.sampleRate ?? 16000
  const channels = opts.channels ?? 1
  const bitsPerSample = opts.bitsPerSample ?? 16
  const seconds = opts.seconds ?? 4
  const dataBytes = Math.round(sampleRate * channels * (bitsPerSample / 8) * seconds)

  const buf = Buffer.alloc(44 + dataBytes)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(channels, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28)
  buf.writeUInt16LE(channels * (bitsPerSample / 8), 32)
  buf.writeUInt16LE(bitsPerSample, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataBytes, 40)
  if (!opts.silent) buf.fill(0x7f, 44)
  return buf
}

/**
 * 造一段 18 字节 `fmt ` 块的 WAV（Windows SAPI 就是这个形状）。
 * 这时 `data` 落在偏移 38，按下标硬读会误判成「缺少 data 块」。
 */
function makeWavWithExtendedFmt(seconds = 4): Buffer {
  const rate = 16000
  const dataBytes = rate * 2 * seconds
  const fmtBody = 18
  const buf = Buffer.alloc(12 + 8 + fmtBody + 8 + dataBytes)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(buf.length - 8, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(fmtBody, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // 单声道
  buf.writeUInt32LE(rate, 24)
  buf.writeUInt32LE(rate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.writeUInt16LE(0, 36) // cbSize
  buf.write('data', 38)
  buf.writeUInt32LE(dataBytes, 42)
  buf.fill(0x7f, 46)
  return buf
}

describe('parseWavHeader', () => {
  it('解析出采样率、声道、位深与时长', () => {
    const info = parseWavHeader(makeWav({ seconds: 6 }))
    expect(info.sampleRate).toBe(16000)
    expect(info.channels).toBe(1)
    expect(info.bitsPerSample).toBe(16)
    expect(info.durationMs).toBe(6000)
  })

  it('时长按字节数算，与数据段大小一致', () => {
    expect(parseWavHeader(makeWav({ seconds: 3 })).durationMs).toBe(3000)
    expect(parseWavHeader(makeWav({ seconds: 15 })).durationMs).toBe(15000)
  })

  it('非 16k 立体声也能正确解析（用于后续拒绝）', () => {
    const info = parseWavHeader(makeWav({ sampleRate: 44100, channels: 2, seconds: 2 }))
    expect(info.sampleRate).toBe(44100)
    expect(info.channels).toBe(2)
    expect(info.durationMs).toBe(2000)
  })

  // 回归：真实踩到过。Windows SAPI 输出 18 字节 fmt 块，data 在偏移 38，
  // 早期按下标硬读 36 的实现会把这种完全合法的文件判成「缺少 data 块」。
  it('18 字节 fmt 块（Windows SAPI 的形状）也能解析', () => {
    const info = parseWavHeader(makeWavWithExtendedFmt(6))
    expect(info.sampleRate).toBe(16000)
    expect(info.channels).toBe(1)
    expect(info.bitsPerSample).toBe(16)
    expect(info.durationMs).toBe(6000)
  })

  it('fmt 与 data 之间夹着别的块（LIST）也能跳过并解析', () => {
    const base = makeWav({ seconds: 4 })
    const listBody = 10
    const extra = Buffer.alloc(8 + listBody + (listBody % 2))
    extra.write('LIST', 0)
    extra.writeUInt32LE(listBody, 4)

    const merged = Buffer.concat([base.subarray(0, 36), extra, base.subarray(36)])
    merged.writeUInt32LE(merged.length - 8, 4)

    const info = parseWavHeader(merged)
    expect(info.durationMs).toBe(4000)
  })

  it('fmt 块声明的长度小于 16 → 拒绝', () => {
    const bad = makeWav()
    bad.writeUInt32LE(10, 16)
    expect(() => parseWavHeader(bad)).toThrow(/fmt 块长度异常/)
  })

  it('数据太短 → 拒绝', () => {
    expect(() => parseWavHeader(Buffer.alloc(20))).toThrow(InvalidAudioError)
  })

  it('不是 RIFF/WAVE → 拒绝', () => {
    const bad = makeWav()
    bad.write('XXXX', 0)
    expect(() => parseWavHeader(bad)).toThrow(/格式不受支持/)
  })

  it('缺少 fmt 块 → 拒绝', () => {
    const bad = makeWav()
    bad.write('junk', 12)
    expect(() => parseWavHeader(bad)).toThrow(/fmt/)
  })

  it('非 PCM（压缩格式）→ 拒绝', () => {
    const bad = makeWav()
    bad.writeUInt16LE(3, 20) // IEEE float
    expect(() => parseWavHeader(bad)).toThrow(/PCM/)
  })

  it('缺少 data 块 → 拒绝', () => {
    const bad = makeWav()
    bad.write('junk', 36)
    expect(() => parseWavHeader(bad)).toThrow(/data/)
  })

  it('数据段长度为 0（没录到声音）→ 拒绝，且提示检查麦克风', () => {
    const bad = makeWav({ seconds: 0 })
    expect(() => parseWavHeader(bad)).toThrow(/没有录到声音/)
  })

  it('声明的数据长度超过实际字节（被截断）→ 拒绝', () => {
    const bad = makeWav({ seconds: 4 })
    bad.writeUInt32LE(bad.readUInt32LE(40) + 5000, 40)
    expect(() => parseWavHeader(bad)).toThrow(/截断/)
  })
})

describe('assertDuration（PRD 09 窗口）', () => {
  const expect16k = { sampleRate: 16000, channels: 1 }
  const repeat = { minSeconds: 3, maxSeconds: 15, label: '跟读' }
  const answer = { minSeconds: 30, maxSeconds: 60, label: '情境应答' }

  it('跟读窗口内的时长通过', () => {
    expect(() => assertDuration(repeat, parseWavHeader(makeWav({ seconds: 3 })), expect16k)).not.toThrow()
    expect(() => assertDuration(repeat, parseWavHeader(makeWav({ seconds: 15 })), expect16k)).not.toThrow()
  })

  it('跟读太短（2 秒）→ 拒绝并给出实际秒数', () => {
    expect(() => assertDuration(repeat, parseWavHeader(makeWav({ seconds: 2 })), expect16k)).toThrow(
      /至少要说满 3 秒（本次 2\.0 秒）/,
    )
  })

  it('跟读太长（16 秒）→ 拒绝', () => {
    expect(() => assertDuration(repeat, parseWavHeader(makeWav({ seconds: 16 })), expect16k)).toThrow(
      /不能超过 15 秒/,
    )
  })

  it('应答太短（20 秒）→ 拒绝', () => {
    expect(() => assertDuration(answer, parseWavHeader(makeWav({ seconds: 20 })), expect16k)).toThrow(
      /情境应答至少要说满 30 秒/,
    )
  })

  it('应答窗口内的 45 秒通过', () => {
    expect(() => assertDuration(answer, parseWavHeader(makeWav({ seconds: 45 })), expect16k)).not.toThrow()
  })

  it('采样率不是 16k → 拒绝并给出实际值', () => {
    expect(() =>
      assertDuration(repeat, parseWavHeader(makeWav({ sampleRate: 44100, seconds: 5 })), expect16k),
    ).toThrow(/采样率应为 16000Hz，实际是 44100Hz/)
  })

  it('立体声 → 拒绝', () => {
    expect(() =>
      assertDuration(repeat, parseWavHeader(makeWav({ channels: 2, seconds: 5 })), expect16k),
    ).toThrow(/单声道/)
  })
})
