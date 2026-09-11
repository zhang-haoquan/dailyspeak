/**
 * WAV 头解析（服务端权威校验）
 *
 * 为什么不直接信客户端上报的 `durationMs`：时长的合法性判定（跟读 3–15 秒、
 * 应答 30–60 秒）是**准入条件**，客户端可以随便写一个数字绕过去。
 * 而且格式（16k 单声道 16-bit）本来就该由服务端确认——腾讯云只认这种 WAV，
 * 传错了要到调用第三方时才报错，白白浪费一次往返和一次配额。
 *
 * 【为什么逐块遍历而不是硬读偏移 44】
 * WAV 是分块（chunk）格式，`fmt ` 之后、`data` 之前允许有别的块
 * （`fact`、`LIST`…），而且 `fmt ` 本身就有 16 / 18 / 40 字节等多种长度。
 * 踩过的实例：Windows SAPI 生成的 WAV 用 18 字节 `fmt `，`data` 落在偏移 38，
 * 按下标硬读会把这个**完全合法**的文件判成「缺少 data 块」。
 */

export interface WavInfo {
  sampleRate: number
  channels: number
  bitsPerSample: number
  /** 数据段字节数 */
  dataBytes: number
  /** 时长（毫秒），由字节数与采样率算出 */
  durationMs: number
}

export class InvalidAudioError extends Error {}

const HEADER_BYTES = 44

/**
 * 解析 WAV。任何不合法都抛 `InvalidAudioError`（中文、可直接展示给用户）。
 *
 * 严格的地方：必须是 RIFF/WAVE、必须是未压缩 PCM、必须有 fmt 与 data 块、
 * data 长度必须与实际字节对得上。宽松的地方：块的长度与顺序随意、允许有额外块。
 */
export function parseWavHeader(buffer: Buffer): WavInfo {
  if (buffer.length < HEADER_BYTES) {
    throw new InvalidAudioError('音频数据不完整，请重新录制')
  }
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new InvalidAudioError('音频格式不受支持，请重新录制')
  }

  let offset = 12
  let fmt: { audioFormat: number; channels: number; sampleRate: number; bitsPerSample: number } | null =
    null
  let dataOffset = -1
  let dataBytes = 0

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const body = offset + 8

    if (id === 'fmt ') {
      if (size < 16 || body + 16 > buffer.length) {
        throw new InvalidAudioError('音频格式不受支持：fmt 块长度异常')
      }
      fmt = {
        audioFormat: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      }
    } else if (id === 'data') {
      dataOffset = body
      // 以实际可读字节为准，少读了就是被截断（声明值大于实际值是典型症状）
      dataBytes = Math.min(size, buffer.length - body)
      if (size > buffer.length - body) {
        throw new InvalidAudioError('音频数据被截断，请重新录制')
      }
      break
    }

    // 块长度为奇数时有一个补齐字节（RIFF 规范）
    offset = body + size + (size % 2)
  }

  if (!fmt) throw new InvalidAudioError('音频格式不受支持：缺少 fmt 块')
  if (fmt.audioFormat !== 1) {
    throw new InvalidAudioError('音频必须是未压缩的 PCM 格式，请重新录制')
  }
  if (dataOffset < 0) throw new InvalidAudioError('音频格式不受支持：缺少 data 块')
  if (dataBytes <= 0) {
    throw new InvalidAudioError('没有录到声音，请检查麦克风后重试')
  }
  if (fmt.sampleRate <= 0 || fmt.channels <= 0 || fmt.bitsPerSample <= 0) {
    throw new InvalidAudioError('音频参数异常，请重新录制')
  }

  const bytesPerSecond = fmt.sampleRate * fmt.channels * (fmt.bitsPerSample / 8)
  const durationMs = Math.round((dataBytes / bytesPerSecond) * 1000)

  return {
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    bitsPerSample: fmt.bitsPerSample,
    dataBytes,
    durationMs,
  }
}

export interface AudioWindow {
  minSeconds: number
  maxSeconds: number
  /** 该环节的名称，用于拼提示文案 */
  label: string
}

/**
 * 按 PRD 09 的时长窗口校验。
 * 超限**直接拒绝并提示**（不是截断，也不是降级）——太短的跟读没有评测意义，
 * 太长的应答说明用户跑题了，让他重录比给一个假分数诚实。
 */
export function assertDuration(window: AudioWindow, info: WavInfo, expected: { sampleRate: number; channels: number }): void {
  if (info.sampleRate !== expected.sampleRate) {
    throw new InvalidAudioError(
      `音频采样率应为 ${expected.sampleRate}Hz，实际是 ${info.sampleRate}Hz，请重新录制`,
    )
  }
  if (info.channels !== expected.channels) {
    throw new InvalidAudioError(
      `音频应为 ${expected.channels === 1 ? '单' : '多'}声道，实际是 ${info.channels} 声道，请重新录制`,
    )
  }

  const seconds = info.durationMs / 1000
  if (seconds < window.minSeconds) {
    throw new InvalidAudioError(
      `${window.label}至少要说满 ${window.minSeconds} 秒（本次 ${seconds.toFixed(1)} 秒），请重录`,
    )
  }
  if (seconds > window.maxSeconds) {
    throw new InvalidAudioError(
      `${window.label}不能超过 ${window.maxSeconds} 秒（本次 ${seconds.toFixed(1)} 秒），请重录`,
    )
  }
}
