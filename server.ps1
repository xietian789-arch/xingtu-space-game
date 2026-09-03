# ============================================================
# server.ps1 —— 星途 本地静态服务器（零依赖，仅需 Windows PowerShell）
# 由「启动游戏.bat」调用：在项目目录上启动 http://localhost:8321/
# 浏览器对 file:// 直开模式会拦截 ES Module 脚本，因此必须经
# 由 http:// 访问，本脚本即为此目的服务。
#
# 健壮性说明：
#  - 每个请求独立处理，畸形请求（含非法路径字符、目录穿越等）
#    只返回 400/403/404/500，绝不会导致服务器崩溃退出
#  - 每条请求都会打印日志（方法 / 路径 / 状态码），便于排查问题
# ============================================================

param(
  [string]$Root = (Split-Path -Parent $MyInvocation.MyCommand.Path),
  [int]$Port = 8321,
  [int]$MaxRequests = 0   # 0 = 持续服务；>0 = 处理指定数量请求后退出（自检用）
)

# 注意：这里刻意不设置 $ErrorActionPreference = 'Stop'，
# 所有请求级异常都在循环内捕获处理，保证服务器不会被单条坏请求打死。

# MIME 类型映射
$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.mjs'  = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.glb'  = 'model/gltf-binary'
  '.gltf' = 'model/gltf+json'
  '.mp3'  = 'audio/mpeg'
  '.wav'  = 'audio/wav'
  '.txt'  = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener

# 自动寻找可用端口（8321 起，被占用则顺延）
while ($true) {
  try {
    $listener.Prefixes.Clear()
    $listener.Prefixes.Add("http://localhost:$Port/")
    $listener.Start()
    break
  } catch {
    $Port++
    if ($Port -gt 8350) {
      Write-Host '错误：8321-8350 端口均被占用，无法启动服务器。' -ForegroundColor Red
      Read-Host '按回车键退出'
      exit 1
    }
  }
}

# 启动时先把根目录规范化，避免每次请求重复计算。
# 防御性清理：命令行引号转义等怪癖可能给路径混入多余引号或反斜杠
# （例如 bat 传 "%~dp0" 时结尾的 \" 会被解析成字面引号），先清理再校验。
$Root = $Root.Trim().Trim('"').TrimEnd('\')
if ($Root -eq '') { $Root = Split-Path -Parent $MyInvocation.MyCommand.Path }

$rootFull = $null
try { $rootFull = [System.IO.Path]::GetFullPath($Root) } catch { $rootFull = $null }

if (-not $rootFull) {
  # 传入的根目录仍然非法时，回退到脚本自身所在目录（即项目目录，必然有效）
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  Write-Host ('警告：无法解析根目录 [' + $Root + ']，改用脚本所在目录。') -ForegroundColor Yellow
  $rootFull = [System.IO.Path]::GetFullPath($scriptDir)
}

$url = "http://localhost:$Port/"
Write-Host '================================================' -ForegroundColor Cyan
Write-Host '   星途 —— 中国航天史太空穿梭 · 本地服务器' -ForegroundColor Cyan
Write-Host ('   访问地址：' + $url) -ForegroundColor Green
Write-Host ('   根目录：' + $rootFull) -ForegroundColor DarkGray
Write-Host '   浏览器已自动打开。请勿关闭本窗口，' -ForegroundColor Yellow
Write-Host '   关闭即停止游戏服务。按 Ctrl+C 也可停止。' -ForegroundColor Yellow
Write-Host '================================================' -ForegroundColor Cyan

# 自动打开默认浏览器（自检模式跳过）
if ($MaxRequests -eq 0) { Start-Process $url }

# 统一的出错响应函数（客户端可能已断开，需要层层保护）
function Send-ErrorResponse($ctx, $code, $text) {
  try {
    $ctx.Response.StatusCode = $code
    $b = [System.Text.Encoding]::UTF8.GetBytes($text)
    $ctx.Response.ContentType = 'text/plain; charset=utf-8'
    $ctx.Response.ContentLength64 = $b.Length
    if ($ctx.Request.HttpMethod -ne 'HEAD') {
      $ctx.Response.OutputStream.Write($b, 0, $b.Length)
    }
    $ctx.Response.Close()
  } catch {
    try { $ctx.Response.Abort() } catch {}
  }
}

$count = 0
while ($listener.IsListening) {
  # 等待下一个请求（客户端可能在握手阶段就断开，这里也要保护）
  try {
    $ctx = $listener.GetContext()
  } catch {
    continue
  }

  $raw = ''
  $status = 500
  try {
    $raw = [string]$ctx.Request.RawUrl
    $reqPath = [string]$ctx.Request.Url.LocalPath
    if ($reqPath -eq '/') { $reqPath = '/index.html' }

    $rel = $reqPath.TrimStart('/').Replace('/', '\')

    # 1) 含 Windows 路径非法字符或通配符的 URL 直接拒绝
    $bad = $false
    if ($rel.Length -gt 0) {
      if ($rel.IndexOfAny([System.IO.Path]::GetInvalidPathChars()) -ge 0) { $bad = $true }
      if ($rel.IndexOf('*') -ge 0 -or $rel.IndexOf('?') -ge 0) { $bad = $true }
    }

    if ($bad) {
      $status = 400
      Send-ErrorResponse $ctx 400 '400 Bad Request'
    } else {
      # 2) 规范化路径并防止目录穿越
      $full = [System.IO.Path]::GetFullPath((Join-Path $rootFull $rel))

      if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        $status = 403
        Send-ErrorResponse $ctx 403 '403 Forbidden'
      }
      elseif (Test-Path $full -PathType Leaf) {
        # 3) 正常静态文件响应
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $ext = [System.IO.Path]::GetExtension($full).ToLower()
        $ct = $mime[$ext]
        if (-not $ct) { $ct = 'application/octet-stream' }
        $ctx.Response.StatusCode = 200
        $ctx.Response.ContentType = $ct
        $ctx.Response.ContentLength64 = $bytes.Length
        if ($ctx.Request.HttpMethod -ne 'HEAD') {
          $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        $ctx.Response.Close()
        $status = 200
      }
      else {
        $status = 404
        Send-ErrorResponse $ctx 404 ('404 Not Found: ' + $reqPath)
      }
    }
  } catch {
    # 无论收到多奇怪的请求，记录后返回 500，绝不让服务器崩溃
    $status = 500
    Write-Host ('  请求处理异常：' + $raw + ' -> ' + $_.Exception.Message) -ForegroundColor DarkYellow
    Send-ErrorResponse $ctx 500 '500 Internal Server Error'
  }

  # 请求日志：方法 / 原始路径 / 状态码
  Write-Host ('  [{0}] {1} -> {2}' -f $ctx.Request.HttpMethod, $raw, $status) -ForegroundColor Gray

  $count++
  if ($MaxRequests -gt 0 -and $count -ge $MaxRequests) { break }
}

$listener.Stop()
$listener.Close()
