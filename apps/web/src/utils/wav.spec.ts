import { describe, it, expect, vi } from 'vitest'
import { downmixToMono, encodeWavPcm16, encodeToWav16kMono, resampleLinear, TARGET_SAMPLE_RATE } from './wav'

/** 解析出来的 WAV 头字段，供断言逐项比对 */
interface WavHeader {
  riff: string
  riffSize: number
  wave: string
  fmt: string
  fmtSize: number
  audioFormat: number
  numChannels: number
  sampleRate: number
  byteRate: number
  blockAlign: number
  bitsPerSample: number
  data: string
  dataSize: number
  /** data 块首字节在 ArrayBuffer 里的下标（标准 44 字节头时为 44） */
  dataStart: number
}

function parseWav(buffer: ArrayBuffer): WavHeader {
  const view = new DataView(buffer)
  const ascii = (offset: number, length: number) => {
    let text = ''
    for (let i = 0; i < length; i++) text += String.fromCharCode(view.getUint8(offset + i))
    return text
  }

  let cursor = 12 // 跳过 RIFF 头
  while (cursor + 8 <= buffer.byteLength) {
    const id = ascii(cursor, 4)
    const size = view.getUint32(cursor + 4, true)
    if (id === 'data') {
      return {
        riff: ascii(0, 4),
        riffSize: view.getUint32(4, true),
        wave: ascii(8, 4),
        fmt: ascii(12, 4),
        fmtSize: view.getUint32(16, true),
        audioFormat: view.getUint16(20, true),
        numChannels: view.getUint16(22, true),
        sampleRate: view.getUint32(24, true),
        byteRate: view.getUint32(28, true),
        blockAlign: view.getUint16(32, true),
        bitsPerSample: view.getUint16(34, true),
        data: id,
        dataSize: size,
        dataStart: cursor + 8,
      }
    }
    cursor += 8 + size // RIFF 块都是偶数字节，不需要补齐
  }

  throw new Error('WAV 里没有找到 data 块')
}

/** 按小端读回第 index 个 16-bit 样本 */
function readSample(buffer: ArrayBuffer, index: number): number {
  return new DataView(buffer).getInt16(parseWav(buffer).dataStart + index * 2, true)
}

describe('downmixToMono', () => {
  it('双声道逐样本取平均', () => {
    const left = Float32Array.from([1, 0, -1, 0.5])
    const right = Float32Array.from([0, 1, 1, -0.5])

    const mono = downmixToMono([left, right])

    expect(mono.length).toBe(4)
    expect(Array.from(mono)).toEqual([0.5, 0.5, 0, 0])
  })

  it('单声道原样返回', () => {
    const only = Float32Array.from([0.25, -0.25, 0.75])

    expect(downmixToMono([only])).toBe(only)
  })

  it('空输入返回长度为 0 的数组而不是抛异常', () => {
    expect(downmixToMono([]).length).toBe(0)
  })
})

describe('encodeWavPcm16', () => {
  it('写出标准 44 字节头，各字段符合规范', () => {
    const samples = Float32Array.from([0, 0.5, -0.5, 1])
    const buffer = encodeWavPcm16(samples, TARGET_SAMPLE_RATE)
    const header = parseWav(buffer)

    expect(header.riff).toBe('RIFF')
    expect(header.wave).toBe('WAVE')
    expect(header.fmt).toBe('fmt ')
    expect(header.data).toBe('data')

    expect(header.fmtSize).toBe(16)
    expect(header.audioFormat).toBe(1) // 1 = PCM
    expect(header.numChannels).toBe(1)
    expect(header.sampleRate).toBe(16000)
    expect(header.byteRate).toBe(16000 * 2)
    expect(header.blockAlign).toBe(2)
    expect(header.bitsPerSample).toBe(16)

    expect(header.dataSize).toBe(samples.length * 2)
    expect(header.dataStart).toBe(44)
    expect(buffer.byteLength).toBe(44 + header.dataSize)
    expect(header.riffSize).toBe(buffer.byteLength - 8)
  })

  it('浮点样本夹到 [-1,1] 后按 16-bit 量化', () => {
    const buffer = encodeWavPcm16(Float32Array.from([1.0, -1.0, 0]), TARGET_SAMPLE_RATE)

    expect(readSample(buffer, 0)).toBe(32767)
    expect(readSample(buffer, 1)).toBe(-32768)
    expect(readSample(buffer, 2)).toBe(0)
  })

  it('超出范围的值被夹住而不是回绕', () => {
    const buffer = encodeWavPcm16(Float32Array.from([3, -3]), TARGET_SAMPLE_RATE)

    expect(readSample(buffer, 0)).toBe(32767)
    expect(readSample(buffer, 1)).toBe(-32768)
  })

  it('空样本写出只有头的空 WAV', () => {
    const buffer = encodeWavPcm16(new Float32Array(0), TARGET_SAMPLE_RATE)
    const header = parseWav(buffer)

    expect(buffer.byteLength).toBe(44)
    expect(header.dataSize).toBe(0)
  })
})

describe('resampleLinear', () => {
  it('长度按采样率比例变化（16k→8k 约减半）', () => {
    const input = new Float32Array(16000)
    for (let i = 0; i < input.length; i++) input[i] = Math.sin((i / 16000) * 2 * Math.PI * 440)

    const output = resampleLinear(input, 16000, 8000)

    expect(output.length).toBe(8000)
  })

  it('同采样率时内容不变', () => {
    const input = Float32Array.from([0.1, -0.2, 0.3, -0.4])

    expect(Array.from(resampleLinear(input, 16000, 16000))).toEqual(Array.from(input))
  })

  it('空输入返回空', () => {
    expect(resampleLinear(new Float32Array(0), 16000, 8000).length).toBe(0)
  })
})

// ---------- encodeToWav16kMono：用最小桩替代 Web Audio ----------
//
// node 里没有 Web Audio，但这一段是**真实的分支逻辑**——重采样走浏览器还是走
// resampleLinear 兜底，直接决定上传的音频对不对，所以用桩把它固定下来回归。
//
// 桩的关键设计：让两条分支的**结果互不相同**。
// 如果输入是常量电平，resampleLinear 的插值结果会和桩渲染出的常量一模一样，
// 于是「代码走错分支」也能全绿（这个坑我踩过一次，故在此写明）。
// 所以让右声道取左声道的反相：降混后互相抵消≈静音，线性插值一路都是小值；
// 而桩渲染的是 ±RESAMPLED_LEVEL 的交替方波。两条路径的字节内容天差地别，
// 断言的是**逐字节精确值**，走错分支必然红。

/** 被测代码只要求能 arrayBuffer()；内容无所谓，解码由桩接管 */
function fakeRecordingBlob(): Blob {
  return new Blob([new Uint8Array(8)], { type: 'audio/webm' })
}

/** 伪造「解码结果」：32000Hz 双声道、0.1 秒，逼着走降混 + 重采样 */
const DECODED_FRAMES = 3200
const DECODED_RATE = 32000

/** 重采样到 16k 后应为 1600 帧（两条路径帧数相同，只能靠内容区分） */
const RESAMPLED_FRAMES = 1600

/** 桩「浏览器重采样」的渲染输出：交替 ±0.25 的方波，与线性插值结果完全不同 */
const RESAMPLED_LEVEL = 0.25

/** 十六进制字节，便于精确比对 WAV 内容 */
function toHex(view: DataView): string {
  const bytes: string[] = []
  for (let i = 0; i < view.byteLength; i++) {
    bytes.push(view.getUint8(i).toString(16).padStart(2, '0'))
  }
  return bytes.join('')
}

/** 把一个样本序列按被测代码同一套量化规则编码，用于逐字节比对 */
function encodeExpectedHex(samples: Float32Array): string {
  return toHex(new DataView(encodeWavPcm16(samples, TARGET_SAMPLE_RATE)))
}

/**
 * 合成的双声道输入：右声道是左声道的**反相**副本。
 * 这样降混结果恰好为 0，而桩渲染的方波幅度是 ±0.25 —— 两条分支的产物一个近乎
 * 静音、一个是满幅交替，任何一条走错都能被子节级比对立刻发现。
 */
function decodedChannels(): Float32Array[] {
  const left = new Float32Array(DECODED_FRAMES)
  const right = new Float32Array(DECODED_FRAMES)
  for (let i = 0; i < DECODED_FRAMES; i++) {
    left[i] = Math.sin((i / DECODED_RATE) * 2 * Math.PI * 40)
    right[i] = -left[i]
  }
  return [left, right]
}

interface StubOptions {
  /** 浏览器是否提供 OfflineAudioContext */
  withOffline: boolean
  /** 模拟构造 OfflineAudioContext 直接抛错 */
  throwOnConstruct?: boolean
}

/**
 * 装上最小 Web Audio 桩。
 * 返回 closed：被关掉的解码上下文数量；copyToChannelCalled：是否真的把样本喂给了 BufferSource。
 *
 * window 上只挂本次需要的构造器——若同时挂两个不同实现的桩，代码误调用另一个
 * 时用例照样绿。每次只给一个，误用必然失败。
 */
function installWebAudioStub(options: StubOptions) {
  const closed: number[] = []
  let copyToChannelCalled = false
  const channels = decodedChannels()

  class StubAudioBuffer {
    numberOfChannels = 2
    sampleRate = DECODED_RATE
    duration = DECODED_FRAMES / DECODED_RATE
    getChannelData(index: number) {
      return channels[index]
    }
  }

  class StubAudioContext {
    async decodeAudioData() {
      return new StubAudioBuffer()
    }
    async close() {
      closed.push(1)
    }
  }

  class StubOfflineAudioContext {
    destination = {}
    constructor(
      public numberOfChannels: number,
      public length: number,
      public sampleRate: number,
    ) {
      if (options.throwOnConstruct) throw new Error('构造函数抛错（模拟不支持）')
    }
    createBuffer() {
      return {
        copyToChannel: () => {
          copyToChannelCalled = true
        },
      }
    }
    createBufferSource() {
      return { buffer: null, connect: () => undefined, start: () => undefined }
    }
    async startRendering() {
      // 交替方波：与线性插值结果（≈抵消后的小值）完全不同
      return {
        getChannelData: () =>
          Float32Array.from({ length: RESAMPLED_FRAMES }, (_, i) =>
            i % 2 === 0 ? RESAMPLED_LEVEL : -RESAMPLED_LEVEL,
          ),
      }
    }
  }

  vi.stubGlobal('window', {
    AudioContext: StubAudioContext,
    ...(options.withOffline ? { OfflineAudioContext: StubOfflineAudioContext } : {}),
  })

  return {
    closed,
    wasCopiedToChannel: () => copyToChannelCalled,
  }
}

describe('encodeToWav16kMono（用桩替代 Web Audio）', () => {
  it('OfflineAudioContext 可用时走浏览器重采样，并关掉解码上下文', async () => {
    const stub = installWebAudioStub({ withOffline: true })

    try {
      const clip = await encodeToWav16kMono(fakeRecordingBlob())

      expect(clip.sampleRate).toBe(TARGET_SAMPLE_RATE)
      // 时长取解码后 buffer.duration，而不是用 WAV 字节数反推
      expect(clip.durationMs).toBeCloseTo(100, 5)
      expect(clip.blob.type).toBe('audio/wav')

      const bytes = await clip.blob.arrayBuffer()
      expect(bytes.byteLength).toBe(44 + RESAMPLED_FRAMES * 2)

      // 逐样本精确比对：输出必须**恰好**是桩渲染的交替方波。
      // 兜底的 resampleLinear 给出的是降混后≈0 的插值，绝无可能对上这串值。
      const expected = Float32Array.from({ length: RESAMPLED_FRAMES }, (_, i) =>
        i % 2 === 0 ? RESAMPLED_LEVEL : -RESAMPLED_LEVEL,
      )
      expect(toHex(new DataView(bytes))).toBe(encodeExpectedHex(expected))

      // 样本确实经过降混喂给了 BufferSource，而不是把整段原始立体声丢进去
      expect(stub.wasCopiedToChannel()).toBe(true)
      // 解码用的 AudioContext 用完就 close
      expect(stub.closed.length).toBe(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('OfflineAudioContext 不存在时回退 resampleLinear', async () => {
    installWebAudioStub({ withOffline: false })

    try {
      const clip = await encodeToWav16kMono(fakeRecordingBlob())
      const bytes = await clip.blob.arrayBuffer()

      // 期望值用真实函数对**降混后**的单声道算一遍，而不是猜一个长度
      const mono = downmixToMono(decodedChannels())
      const expected = resampleLinear(mono, DECODED_RATE, TARGET_SAMPLE_RATE)

      expect(mono.length).toBe(DECODED_FRAMES)
      // 前提校验：这条路径的输出必须与桩方波明显不同，否则本用例就退化成
      // 「怎么走都绿」的空断言（反相双声道降混后应近乎静音）
      let peak = 0
      for (const value of expected) peak = Math.max(peak, Math.abs(value))
      expect(peak).toBeLessThan(RESAMPLED_LEVEL / 4)

      expect(toHex(new DataView(bytes))).toBe(encodeExpectedHex(expected))

      expect(clip.durationMs).toBeCloseTo(100, 5)
      expect(clip.sampleRate).toBe(TARGET_SAMPLE_RATE)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('OfflineAudioContext 构造抛错时也回退 resampleLinear', async () => {
    installWebAudioStub({ withOffline: true, throwOnConstruct: true })

    try {
      const clip = await encodeToWav16kMono(fakeRecordingBlob())
      const bytes = await clip.blob.arrayBuffer()

      const mono = downmixToMono(decodedChannels())
      const expected = resampleLinear(mono, DECODED_RATE, TARGET_SAMPLE_RATE)

      // 构造抛错后不可能拿到桩方波，内容应与线性插值逐样本一致
      expect(toHex(new DataView(bytes))).toBe(encodeExpectedHex(expected))
      expect(clip.durationMs).toBeCloseTo(100, 5)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('解码失败抛出中文错误，且同样释放上下文', async () => {
    const closedFlags: boolean[] = []
    class FailingAudioContext {
      async decodeAudioData(): Promise<never> {
        throw new Error('decodeAudioData: unsupported container')
      }
      async close() {
        closedFlags.push(true)
      }
    }
    vi.stubGlobal('window', { AudioContext: FailingAudioContext })

    try {
      await expect(encodeToWav16kMono(fakeRecordingBlob())).rejects.toThrow(
        '无法解析这段录音，请重新录制',
      )
      // 解码失败也要释放上下文
      expect(closedFlags.length).toBe(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('浏览器完全不支持 Web Audio 时抛出中文错误', async () => {
    // 模拟非浏览器环境：window 上没有 AudioContext
    vi.stubGlobal('window', {})

    try {
      await expect(encodeToWav16kMono(fakeRecordingBlob())).rejects.toThrow(
        '无法解析这段录音，请重新录制',
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
