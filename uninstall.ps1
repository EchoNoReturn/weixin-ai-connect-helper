# WeChat AI Connect Helper - Windows 卸载脚本
# 使用方法: irm https://raw.githubusercontent.com/EchoNoReturn/weixin-ai-connect-helper/main/uninstall.ps1 | iex

$ErrorActionPreference = "Stop"

# 配置
$InstallDir = Join-Path $env:USERPROFILE ".wah"
$StateDir = Join-Path $env:USERPROFILE ".weixin-ai-connect-helper"

# 颜色函数
function Write-Info { Write-Host $args -ForegroundColor Green }
function Write-Warn { Write-Host $args -ForegroundColor Yellow }
function Write-Error { Write-Host $args -ForegroundColor Red; exit 1 }

# 停止服务
function Stop-Service {
    $wahExe = Join-Path $InstallDir "wah.exe"
    
    # 检查 wah 是否存在
    if (-not (Test-Path $wahExe)) {
        return
    }
    
    # 检查是否有 PID 文件
    $pidFile = Join-Path $StateDir "bridge.pid"
    if (-not (Test-Path $pidFile)) {
        return
    }
    
    $pid = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ([string]::IsNullOrWhiteSpace($pid)) {
        return
    }
    
    # 检查进程是否在运行
    $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if ($null -ne $process) {
        Write-Info "检测到服务正在运行 (PID: $pid)，正在停止..."
        & $wahExe stop 2>$null
        Start-Sleep -Seconds 1
    }
}

# 卸载
function Uninstall-Wah {
    Write-Info "正在卸载 weixin-ai-connect-helper..."
    
    # 先停止服务
    Stop-Service
    
    # 删除安装目录
    if (Test-Path $InstallDir) {
        Remove-Item -ItemType Directory -Force -Path $InstallDir
        Write-Info "已删除安装目录: $InstallDir"
    } else {
        Write-Warn "安装目录不存在: $InstallDir"
    }
    
    # 删除状态目录
    if (Test-Path $StateDir) {
        Remove-Item -ItemType Directory -Force -Path $StateDir
        Write-Info "已删除状态目录: $StateDir"
    }
    
    # 从 PATH 移除
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -like "*$InstallDir*") {
        $newPath = ($currentPath -split ";" | Where-Object { $_ -ne $InstallDir }) -join ";"
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        $env:Path = ($env:Path -split ";" | Where-Object { $_ -ne $InstallDir }) -join ";"
        Write-Info "已从 PATH 移除安装目录"
    }
    
    Write-Info "卸载完成！"
    Write-Host ""
    Write-Host "  注意: 可能需要重启终端才能使更改生效"
    Write-Host ""
}

# 主函数
function Main {
    param(
        [switch]$Help
    )
    
    if ($Help) {
        Write-Host "WeChat AI Connect Helper Windows 卸载脚本"
        Write-Host ""
        Write-Host "用法: .\uninstall.ps1 [选项]"
        Write-Host ""
        Write-Host "选项:"
        Write-Host "  (无)          卸载程序"
        Write-Host "  -Help         显示帮助"
        Write-Host ""
        Write-Host "快速卸载（管理员 PowerShell）:"
        Write-Host "  irm https://raw.githubusercontent.com/EchoNoReturn/weixin-ai-connect-helper/main/uninstall.ps1 | iex"
        Write-Host ""
        return
    }
    
    Uninstall-Wah
}

Main @PSBoundParameters
