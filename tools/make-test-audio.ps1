<#
  生成测试用英文语音（16kHz 单声道 16-bit PCM WAV）

  为什么需要它：腾讯云一句话识别只接受特定格式的音频，而 TLS 之外的验证
  必须用**真实语音**才测得出东西——静音或正弦波只能验鉴权，识别结果永远是空的。

  依赖 Windows 自带的 SAPI 语音合成（Microsoft Zira，en-US）。
  macOS / Linux 请用 `say -o out.aiff` 或 `espeak-ng` + `ffmpeg -ar 16000 -ac 1` 自行生成。

  用法：
    pwsh tools/make-test-audio.ps1 -Text "I am a software developer." -Out "$env:TEMP\a.wav"
#>
param(
  [Parameter(Mandatory = $true)][string]$Text,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Voice = 'Microsoft Zira Desktop',
  [int]$Rate = 0
)

Add-Type -AssemblyName System.Speech

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$installed = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }
if ($installed -notcontains $Voice) {
  Write-Error "找不到语音「$Voice」。已安装：$($installed -join ', ')"
  exit 1
}

$synth.SelectVoice($Voice)
$synth.Rate = $Rate

# 直接以 16kHz / 单声道 / 16-bit 输出，省掉一次重采样
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
  16000,
  [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
  [System.Speech.AudioFormat.AudioChannel]::Mono
)
$synth.SetOutputToWaveFile($Out, $fmt)
$synth.Speak($Text)
$synth.Dispose()

$bytes = [System.IO.File]::ReadAllBytes($Out)

# 逐块找到 data 块再算时长。不要硬读偏移 40：
# SAPI 用的是 18 字节的 fmt 块，data 落在偏移 38，硬读会算出天文数字。
$offset = 12
$dataBytes = 0
$rate = 16000
$channels = 1
$bits = 16
while ($offset + 8 -le $bytes.Length) {
  $id = [System.Text.Encoding]::ASCII.GetString($bytes, $offset, 4)
  $size = [BitConverter]::ToUInt32($bytes, $offset + 4)
  $body = $offset + 8
  if ($id -eq 'fmt ') {
    $channels = [BitConverter]::ToUInt16($bytes, $body + 2)
    $rate = [BitConverter]::ToUInt32($bytes, $body + 4)
    $bits = [BitConverter]::ToUInt16($bytes, $body + 14)
  } elseif ($id -eq 'data') {
    $dataBytes = $size
    break
  }
  $offset = $body + $size + ($size % 2)
}

$seconds = [Math]::Round($dataBytes / ($rate * $channels * ($bits / 8)), 2)
Write-Host "已生成 $Out（$([Math]::Round($bytes.Length / 1KB, 1)) KB / 约 $seconds 秒 / ${rate}Hz ${channels}ch ${bits}bit）"

# 顺手提示是否落在校验窗口内
if ($seconds -lt 3) { Write-Warning "不足 3 秒，会被跟读的时长校验拒绝" }
elseif ($seconds -gt 15) { Write-Host "超过 15 秒：适合做「情境应答」（窗口 30–60 秒）的素材" }
