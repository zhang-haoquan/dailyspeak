/**
 * 浏览器录音 → 16kHz 单声道 16-bit PCM WAV
 *
 * 为什么必须有这一层：腾讯云「一句话识别」只吃 wav / pcm / ogg-opus 等格式，
 * **不接受 webm**，而 Chrome 的 MediaRecorder 默认录出来的就是 webm/opus。
 * 所以在浏览器里先转成 16k 单声道 PCM WAV 再上传，后端拿到就能直接送识别。
 */

/** 浏览器录音转码结果 */
export interface WavClip {
  /** 16kHz 单声道 16-bit PCM 的 WAV 文件 */
  blob: Blob
  /** 时长（毫秒），由解码后的音频算得 */
  durationMs: number
  /** 采样率，固定 16000 */
  sampleRate: number
}

/** 识别引擎要求的采样率，16k 是语音识别的通用标准 */
export const TARGET_SAMPLE_RATE = 16000

/** 44 字节标准 WAV 头：RIFF(4) + 长度(4) + WAVE(4) + fmt (4) + 16(4) + fmt 体(16) + data(4) + 长度(4) */
const WAV_HEADER_BYTES = 44

/**
 * 带 webkit 前缀的构造器在 lib.dom 里没有类型，而带前缀的那些签名与标准版一致，
 * 这里直接用标准类型描述，避免为了一行兼容代码去全局扩充 Window
 */
type AudioContextCtor = new () => AudioContext
type OfflineAudioContextCtor = new (
  numberOfChannels: number,
  length: number,
  sampleRate: number,
) => OfflineAudioContext

/** 多声道降混为单声道（逐样本取平均） */
export function downmixToMono(channels: Float32Array[]): Float32Array {
  const first = channels[0]
  // 空输入不能抛，返回空数组交给上层当「没录到东西」处理
  if (!first) return new Float32Array(0)
  if (channels.length === 1) return first

  const length = first.length
  const mixed = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    let sum = 0
    for (const channel of channels) sum += channel[i] ?? 0
    mixed[i] = sum / channels.length
  }
  return mixed
}

/** 把 [-1,1] 的浮点样本封装成 16-bit PCM WAV（含 44 字节标准头） */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataBytes = samples.length * 2
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes)
  const view = new DataView(buffer)

  // 全部小端（little-endian），与 WAV/RIFF 规范一致
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, WAV_HEADER_BYTES - 8 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')

  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // fmt 块长度：PCM 固定 16
  view.setUint16(20, 1, true) // audioFormat 1 = PCM（未压缩）
  view.setUint16(22, 1, true) // numChannels 1 = 单声道
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byteRate = 采样率 * 声道数 * 每样本字节数
  view.setUint16(32, 2, true) // blockAlign = 声道数 * 每样本字节数
  view.setUint16(34, 16, true) // bitsPerSample

  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  for (let i = 0; i < samples.length; i++) {
    // 麦克风偶尔会给出超范围值，先夹到 [-1,1] 再量化，否则会溢出回绕成刺耳噪声
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0))
    // 正负分支分开写：负数要的是 -32768，直接用 >> 8 之类的位运算很容易差 1
    view.setInt16(WAV_HEADER_BYTES + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }

  return buffer
}

/** 线性插值重采样（OfflineAudioContext 不可用时的兜底） */
export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (input.length === 0 || fromRate <= 0 || toRate <= 0) return new Float32Array(0)
  if (fromRate === toRate) return input
  if (input.length === 1) return Float32Array.from(input)

  // 按比例算目标长度（Math.round 与 OfflineAudioContext 的样本数口径一致）
  const length = Math.round((input.length * toRate) / fromRate)
  const output = new Float32Array(length)
  const step = (input.length - 1) / Math.max(1, length - 1)

  for (let i = 0; i < length; i++) {
    const pos = i * step
    const left = Math.floor(pos)
    const right = Math.min(left + 1, input.length - 1)
    const weight = pos - left
    output[i] = input[left] * (1 - weight) + input[right] * weight
  }

  return output
}

/**
 * 任意浏览器录音 Blob → 16kHz 单声道 WAV
 *
 * 用 AudioContext 解码（能吃 webm/ogg/mp4 等各种容器），再把**解码后**的
 * AudioBuffer 交给 OfflineAudioContext 重采样——它用的是浏览器自带的高质量
 * 重采样器，比手写插值好得多。只有在它不存在（老旧浏览器 / 非浏览器环境）或
 * 抛错时才回退到 resampleLinear。
 */
export async function encodeToWav16kMono(blob: Blob): Promise<WavClip> {
  // 老 Chrome / iOS 只认 webkit 前缀；这两个属性 lib.dom 没有声明，读的时候放宽类型
  const legacy = window as unknown as {
    webkitAudioContext?: unknown
    webkitOfflineAudioContext?: unknown
  }
  const Ctor: AudioContextCtor | undefined = window.AudioContext ?? legacy.webkitAudioContext
  if (!Ctor) throw new Error('无法解析这段录音，请重新录制')

  const audioContext = new Ctor()
  let buffer: AudioBuffer
  try {
    const bytes = await blob.arrayBuffer()
    buffer = await audioContext.decodeAudioData(bytes)
  } catch {
    // 解码失败对用户只意味着「这段录音坏了」，不要抛底层异常信息
    throw new Error('无法解析这段录音，请重新录制')
  } finally {
    // 解码用的上下文只借用一瞬间，用完立刻释放，避免占用音频硬件
    void audioContext.close().catch(() => undefined)
  }

  const channels = channelDataOf(buffer)
  const mono = downmixToMono(channels)
  const resampled =
    mono.length === 0 ? mono : await resampleToTarget(mono, buffer.sampleRate, TARGET_SAMPLE_RATE)

  // 时长必须用**解码后**的 AudioBuffer 算：重采样会改变样本数，
  // 拿 WAV 字节数反推时长会差一个采样率比例
  return {
    blob: new Blob([encodeWavPcm16(resampled, TARGET_SAMPLE_RATE)], { type: 'audio/wav' }),
    durationMs: buffer.duration * 1000,
    sampleRate: TARGET_SAMPLE_RATE,
  }
}

/** 取解码结果的各声道数据 */
function channelDataOf(buffer: AudioBuffer): Float32Array[] {
  const channels: Float32Array[] = []
  for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i))
  return channels
}

/** 优先交给浏览器重采样，失败再线性插值 */
async function resampleToTarget(
  mono: Float32Array,
  fromRate: number,
  toRate: number,
): Promise<Float32Array> {
  try {
    return await renderResampled(mono, fromRate, toRate)
  } catch {
    return resampleLinear(mono, fromRate, toRate)
  }
}

async function renderResampled(
  mono: Float32Array,
  fromRate: number,
  toRate: number,
): Promise<Float32Array> {
  // 同采样率不用过重采样器，省一次渲染，也避免它做无谓的滤波
  if (fromRate === toRate) return mono

  // 有些环境下 OfflineAudioContext 不存在（或构造时直接抛错），交给调用方兜底
  const legacy = window as unknown as { webkitOfflineAudioContext?: unknown }
  const OfflineCtor: OfflineAudioContextCtor | undefined =
    window.OfflineAudioContext ?? legacy.webkitOfflineAudioContext
  if (!OfflineCtor) throw new Error('OfflineAudioContext 不可用')

  const durationSec = mono.length / fromRate
  const frames = Math.max(1, Math.ceil(durationSec * toRate))
  const offline = new OfflineCtor(1, frames, toRate)

  // 先把单声道数据塞回一个 AudioBuffer 才能被 BufferSource 播放
  const source = offline.createBuffer(1, mono.length, fromRate)
  // 复制一份而不是直接传 mono：copyToChannel 要求底层是普通 ArrayBuffer，
  // 而 getChannelData 拿到的样本类型更宽（可能是 SharedArrayBuffer 支撑的视图）
  source.copyToChannel(Float32Array.from(mono), 0)

  const node = offline.createBufferSource()
  node.buffer = source
  node.connect(offline.destination)
  node.start()

  const rendered = await offline.startRendering()
  const out = rendered.getChannelData(0)
  // 极短音频可能渲染出 0 帧，补一个静音样本，避免下游拿到空 WAV
  return out.length === 0 ? new Float32Array(1) : out
}

/** 写 4 字节 ASCII 标记（RIFF/WAVE/fmt /data） */
function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}
