# WeChat AI Connect Helper - Windows 卸载脚本
# 使用方法: irm https://raw.githubusercontent.com/EchoNoReturn/weixin-ai-connect-helper/main/uninstall.ps1 | iex

param(
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# 配置：程序目录与状态目录分离。
$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\wah"
$StateDir = Join-Path $env:USERPROFILE ".wah"
$LegacyInstallDir = $StateDir
$LegacyStateDir = Join-Path $env:USERPROFILE ".weixin-ai-connect-helper"

# 输出函数（注意：不要遮蔽内置的 Write-Error cmdlet）
function Write-Info { Write-Host $args -ForegroundColor Green }
function Write-Warn { Write-Host $args -ForegroundColor Yellow }

# 停止服务（wah stop 自身能容忍"未运行"状态、也能解析 pgh 的 JSON pid 文件）
function Stop-WahService {
    foreach ($wahExe in @(
        (Join-Path $InstallDir "wah.exe"),
        (Join-Path $LegacyInstallDir "wah.exe")
    )) {
        if (Test-Path $wahExe) {
            Write-Info "正在停止服务（如果在运行）..."
            & $wahExe stop 2>$null | Out-Null
            Start-Sleep -Seconds 1
            return
        }
    }
}

# 卸载
function Uninstall-Wah {
    Write-Info "正在卸载 weixin-ai-connect-helper..."

    # 先停止服务，避免 wah.exe 被占用导致删除失败
    Stop-WahService

    # 只删除明确安装的程序文件；不要递归删除状态目录。
    if (Test-Path $InstallDir) {
        Remove-Item -Force -Path (Join-Path $InstallDir "wah.exe") -ErrorAction SilentlyContinue
        Remove-Item -Force -Path (Join-Path $InstallDir "pgh.exe") -ErrorAction SilentlyContinue
        Remove-Item -Force -Path (Join-Path $InstallDir "plugins.json") -ErrorAction SilentlyContinue
        Remove-Item -Force -Path (Join-Path $InstallDir "bridge.config.json") -ErrorAction SilentlyContinue
        Remove-Item -Force -Path $InstallDir -ErrorAction SilentlyContinue
        Write-Info "已删除程序文件: $InstallDir"
    } else {
        Write-Warn "安装目录不存在: $InstallDir"
    }
    if ($LegacyInstallDir -ne $InstallDir) {
        Remove-Item -Force -Path (Join-Path $LegacyInstallDir "wah.exe") -ErrorAction SilentlyContinue
        Remove-Item -Force -Path (Join-Path $LegacyInstallDir "pgh.exe") -ErrorAction SilentlyContinue
    }

    if (Test-Path $StateDir) {
        Write-Info "已保留状态数据: $StateDir"
    }
    if (Test-Path $LegacyStateDir) {
        Write-Info "已保留旧版状态数据: $LegacyStateDir"
    }

    # 从 PATH 移除（拆分后精确比较，容忍尾部反斜杠差异）
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath) {
        $newPath = ($userPath -split ";" | Where-Object {
            $_ -and ($_.TrimEnd('\') -ne $InstallDir) -and ($_.TrimEnd('\') -ne $LegacyInstallDir)
        }) -join ";"
        if ($newPath -ne $userPath) {
            [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
            Write-Info "已从用户 PATH 移除安装目录"
        }
    }
    $env:Path = ($env:Path -split ";" | Where-Object {
        $_ -and ($_.TrimEnd('\') -ne $InstallDir) -and ($_.TrimEnd('\') -ne $LegacyInstallDir)
    }) -join ";"

    Write-Info "卸载完成！登录凭证、配置、数据库和日志未删除"
    Write-Host ""
    Write-Host "  注意: 可能需要重启终端才能使更改生效"
    Write-Host ""
}

# 主函数（参数来自脚本顶部 param()，函数内通过动态作用域读取）
function Main {
    if ($Help) {
        Write-Host "WeChat AI Connect Helper Windows 卸载脚本"
        Write-Host ""
        Write-Host "用法: .\uninstall.ps1 [选项]"
        Write-Host ""
        Write-Host "选项:"
        Write-Host "  (无)          卸载程序"
        Write-Host "  -Help         显示帮助"
        Write-Host ""
        Write-Host "快速卸载:"
        Write-Host "  irm https://raw.githubusercontent.com/EchoNoReturn/weixin-ai-connect-helper/main/uninstall.ps1 | iex"
        Write-Host ""
        return
    }

    Uninstall-Wah
}

Main
