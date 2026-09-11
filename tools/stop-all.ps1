<#
  一键收工：关闭本项目的所有本地服务

  为什么要有这个脚本：
  「每天下班关服务」是每天都要做一遍的重复动作，而手敲命令有两个坑——
  1. 前端 dev server 不一定在 5173（Vite 端口被占时会自己换，本项目实际跑在 5175）；
  2. `npm run db:down` 曾经因为 supabase CLI 不在 PATH 上而直接报错。
  写成脚本 + 按端口杀，就不用每次去猜端口、也不会漏。

  安全性说明（重要）：
  - **不会**碰 `_npx\...` 下的 node 进程——那是 DeepSeek Harness 本身，杀了对话就断。
  - **不会**碰你自己开着的浏览器：只按 `--user-data-dir` 指向本专用 profile 的 Chrome 进程匹配。
  - `npx supabase stop` **默认保留数据卷**；本脚本不会传 `--no-backup`。
  - Docker Desktop 默认不动（它可能还服务于别的东西），要一起关请显式加 -IncludeDocker。

  用法：
    pwsh tools/stop-all.ps1                    # 停前后端 + 数据库 + 调试 Chrome
    pwsh tools/stop-all.ps1 -IncludeDocker     # 连 Docker Desktop 一起退出
    pwsh tools/stop-all.ps1 -DryRun            # 只看会关哪些，不动手
#>
param(
  [switch]$IncludeDocker,
  [switch]$DryRun
)

$ErrorActionPreference = 'Continue'
$profileDir = Join-Path $env:TEMP 'dailyspeak-chrome'

function Write-Step($text) { Write-Host "`n$text" -ForegroundColor Cyan }
function Write-Done($text) { Write-Host "  [ok] $text" -ForegroundColor Green }
function Write-Skip($text) { Write-Host "  [--] $text" -ForegroundColor DarkGray }

function Stop-ByPort {
  param([int]$Port, [string]$Label)
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) { Write-Skip ":$Port（$Label）本来就没在跑"; return }
  # 注意别用 $pid —— 那是 PowerShell 的只读自动变量（当前进程 id）
  foreach ($procId in ($conns | Select-Object -ExpandProperty OwningProcess -Unique)) {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if (-not $proc) { continue }
    if ($DryRun) { Write-Host "  [dry] 会停 :$Port（$Label）PID $procId $($proc.ProcessName)"; continue }
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Write-Done "已停 :$Port（$Label）PID $procId $($proc.ProcessName)"
  }
}

Write-Host "DailySpeak 收工" -ForegroundColor White
if ($DryRun) { Write-Host "（DryRun：只报告，不执行）" -ForegroundColor Yellow }

# ---------- 1. 前后端 dev server ----------
Write-Step '[1/4] 前后端 dev server'
# 5173 是默认端口，5175 是本项目实际在用的（端口被占时 Vite 会换）
Stop-ByPort -Port 3000 -Label '后端 API'
Stop-ByPort -Port 5173 -Label '前端 dev server（默认端口）'
Stop-ByPort -Port 5175 -Label '前端 dev server（备用端口）'

function Test-DockerUp {
  # docker 命令在 Docker Desktop 退出后会报
  # "open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified"
  # 那不是错误，是「本来就没跑」。先探一下，避免把假警报打给用户。
  $null = docker version --format '{{.Server.Version}}' 2>&1
  return $LASTEXITCODE -eq 0
}

# ---------- 2. 本地数据库 ----------
Write-Step '[2/4] 本地 Supabase（Docker）'
$dockerUp = Test-DockerUp
if (-not $dockerUp) {
  Write-Skip 'Docker Desktop 没在运行，Supabase 容器当然也没跑（数据卷还在磁盘上）'
} elseif ($DryRun) {
  Write-Host '  [dry] 会执行 npx supabase stop'
} else {
  # 不加 --no-backup：那样会删数据卷，测试账号与学习记录一起没
  $out = npx supabase stop 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) {
    Write-Done 'Supabase 已停（数据保留在 docker volume，下次 db:up 会回来）'
  } else {
    Write-Host "  [!] supabase stop 返回 $LASTEXITCODE，输出：" -ForegroundColor Yellow
    ($out -split "`n" | Select-Object -First 6) | ForEach-Object { "      $_" }
  }
}

# ---------- 3. 调试用 Chrome ----------
Write-Step '[3/4] 调试用 Chrome（专用 profile）'
# 只匹配 CommandLine 里带本专用 profile 路径的进程，
# 不会碰用户自己开着的 Chrome
$chrome = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*$profileDir*" }
if (-not $chrome) {
  Write-Skip "没有用 $profileDir 的 Chrome 在跑"
} elseif ($DryRun) {
  Write-Host "  [dry] 会关闭 $($chrome.Count) 个进程"
} else {
  $chrome | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Write-Done "已关闭 $($chrome.Count) 个调试 Chrome 进程"
}

# ---------- 4. Docker Desktop（可选） ----------
Write-Step '[4/4] Docker Desktop'
if (-not $IncludeDocker) {
  Write-Skip '默认不动它；要一起退出请加 -IncludeDocker'
} elseif ($DryRun) {
  Write-Host '  [dry] 会执行 docker desktop stop'
} else {
  $out = docker desktop stop 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) { Write-Done 'Docker Desktop 已退出' }
  else { Write-Host "  [!] docker desktop stop 返回 $LASTEXITCODE" -ForegroundColor Yellow }
}

# ---------- 收尾核对 ----------
if (-not $DryRun) {
  Write-Step '核对结果'
  $still = @()
  foreach ($p in 3000, 5173, 5175, 54321, 54322, 54323, 54324) {
    if (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) { $still += $p }
  }
  if ($still.Count -eq 0) { Write-Done '相关端口全部已释放' }
  else { Write-Host "  [!] 仍在监听：$($still -join ', ')" -ForegroundColor Yellow }

  $vol = if (Test-DockerUp) { docker volume ls 2>&1 | Select-String -Pattern 'supabase_db_' } else { $null }
  if ($vol) {
    Write-Host "`n数据卷仍在（下次 npm run db:up 数据会回来）：" -ForegroundColor Green
    $vol | ForEach-Object { "  $($_.Line.Trim())" }
  } else {
    Write-Host "`n（Docker 已退出，没查数据卷。数据在磁盘上，下次 npm run db:up 会回来）" -ForegroundColor Green
  }
}
Write-Host ''
