# WeChat AI Connect Helper - Windows 安装脚本
# 使用方法: irm https://raw.githubusercontent.com/EchoNoReturn/weixin-ai-connect-helper/main/install.ps1 | iex

param(
    [switch]$Uninstall,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# Windows PowerShell 5.1 默认 TLS 1.0，GitHub 要求 TLS 1.2
if ($PSVersionTable.PSVersion.Major -lt 6) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
}

# 配置
$Repo = "EchoNoReturn/weixin-ai-connect-helper"
$BinaryName = "wah"
$InstallDir = Join-Path $env:USERPROFILE ".wah"
$LegacyStateDir = Join-Path $env:USERPROFILE ".weixin-ai-connect-helper"

# 输出函数（注意：不要遮蔽内置的 Write-Error cmdlet）
function Write-Info { Write-Host $args -ForegroundColor Green }
function Write-Warn { Write-Host $args -ForegroundColor Yellow }
function Exit-WithError {
    # 用 throw 而不是 exit：irm | iex 场景下 exit 会直接关掉用户的 PowerShell 会话
    Write-Host $args -ForegroundColor Red
    throw ($args -join " ")
}

# 检测架构
function Get-Arch {
    $arch = $env:PROCESSOR_ARCHITECTURE
    switch ($arch) {
        "AMD64" { return "amd64" }
        "ARM64" { return "arm64" }
        default { Exit-WithError "不支持的架构: $arch" }
    }
}

# 获取最新版本
function Get-LatestVersion {
    try {
        $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
        return $release.tag_name
    } catch {
        Exit-WithError "获取最新版本失败（网络问题或 GitHub 限流）: $($_.Exception.Message)"
    }
}

# 停止运行中的服务（wah stop 自身能容忍"未运行"状态）
function Stop-WahService {
    $wahExe = Join-Path $InstallDir "$BinaryName.exe"
    if (Test-Path $wahExe) {
        & $wahExe stop 2>$null | Out-Null
        Start-Sleep -Seconds 1
    }
}

# 从 PATH 移除安装目录（拆分后精确比较，容忍尾部反斜杠差异）
function Remove-FromPath {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath) {
        $newPath = ($userPath -split ";" | Where-Object { $_ -and ($_.TrimEnd('\') -ne $InstallDir) }) -join ";"
        if ($newPath -ne $userPath) {
            [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        }
    }
    $env:Path = ($env:Path -split ";" | Where-Object { $_ -and ($_.TrimEnd('\') -ne $InstallDir) }) -join ";"
}

# 安装
function Install-Wah {
    $arch = Get-Arch
    $version = Get-LatestVersion

    Write-Info "检测到架构: $arch"
    Write-Info "最新版本: $version"

    # 构建下载 URL
    $archiveName = "$BinaryName-windows-$arch.exe.zip"
    $url = "https://github.com/$Repo/releases/download/$version/$archiveName"

    Write-Info "下载地址: $url"

    # 创建临时目录
    $tmpDir = Join-Path $env:TEMP "wah-install-$([System.Guid]::NewGuid())"
    New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

    try {
        # 下载
        Write-Info "正在下载..."
        $archivePath = Join-Path $tmpDir $archiveName
        Invoke-WebRequest -Uri $url -OutFile $archivePath -UseBasicParsing

        # 解压
        Write-Info "正在解压..."
        Expand-Archive -Path $archivePath -DestinationPath $tmpDir -Force

        # 若旧版本正在运行，先停止，避免文件占用
        Stop-WahService

        # 创建安装目录
        New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

        # 安装可执行文件
        Write-Info "正在安装到 $InstallDir..."
        Copy-Item (Join-Path $tmpDir "wah.exe") (Join-Path $InstallDir "$BinaryName.exe") -Force
        Copy-Item (Join-Path $tmpDir "pgh.exe") (Join-Path $InstallDir "pgh.exe") -Force

        # 配置文件仅在目标不存在时复制，避免重装覆盖用户修改
        foreach ($f in @("plugins.json", "bridge.config.json")) {
            $src = Join-Path $tmpDir $f
            $dst = Join-Path $InstallDir $f
            if ((Test-Path $src) -and (-not (Test-Path $dst))) {
                Copy-Item $src $dst
            }
        }
    } finally {
        # 清理（Remove-Item 没有 -ItemType 参数；删除非空目录需要 -Recurse）
        Remove-Item -Recurse -Force -Path $tmpDir -ErrorAction SilentlyContinue
    }

    # 添加到 PATH
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $entries = @($userPath -split ";" | Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\') })
    if ($entries -notcontains $InstallDir) {
        Write-Warn "正在添加安装目录到 PATH..."
        [Environment]::SetEnvironmentVariable("Path", "$userPath;$InstallDir", "User")
        $env:Path = "$env:Path;$InstallDir"
    }

    Write-Info "安装完成！"
    Write-Host ""
    Write-Host "  版本: $version"
    Write-Host "  位置: $InstallDir"
    Write-Host ""
    Write-Host "  使用方法:"
    Write-Host "    $BinaryName start    # 启动服务"
    Write-Host "    $BinaryName --help   # 查看帮助"
    Write-Host ""
    Write-Host "  注意: 新开的终端才能直接使用 $BinaryName 命令"
    Write-Host ""
}

# 卸载
function Uninstall-Wah {
    Write-Info "正在卸载..."

    # 先停止服务，避免文件占用导致删除失败
    Stop-WahService

    # 删除安装目录（包含状态数据：登录凭证、bridge.db、日志）
    if (Test-Path $InstallDir) {
        Remove-Item -Recurse -Force -Path $InstallDir
        Write-Info "已删除安装目录: $InstallDir"
    }

    # 清理旧版本遗留的状态目录
    if (Test-Path $LegacyStateDir) {
        Remove-Item -Recurse -Force -Path $LegacyStateDir
        Write-Info "已删除旧版状态目录: $LegacyStateDir"
    }

    Remove-FromPath

    Write-Info "卸载完成（登录凭证与配置已一并删除）"
}

# 主函数（参数来自脚本顶部 param()，函数内通过动态作用域读取）
function Main {
    if ($Help) {
        Write-Host "WeChat AI Connect Helper Windows 安装脚本"
        Write-Host ""
        Write-Host "用法: .\install.ps1 [选项]"
        Write-Host ""
        Write-Host "选项:"
        Write-Host "  (无)          安装程序"
        Write-Host "  -Uninstall    卸载程序"
        Write-Host "  -Help         显示帮助"
        Write-Host ""
        Write-Host "快速安装:"
        Write-Host "  irm https://raw.githubusercontent.com/$Repo/main/install.ps1 | iex"
        Write-Host ""
        return
    }

    if ($Uninstall) {
        Uninstall-Wah
    } else {
        Install-Wah
    }
}

Main
