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
# 目录可用环境变量覆盖，与 install.sh 的 INSTALL_DIR / BRIDGE_STATE_DIR 对齐
$InstallDir = if ($env:INSTALL_DIR) { $env:INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "Programs\wah" }
$StateDir = if ($env:BRIDGE_STATE_DIR) { $env:BRIDGE_STATE_DIR } else { Join-Path $env:USERPROFILE ".wah" }
# 旧版把程序与状态都放在 ~/.wah（与 BRIDGE_STATE_DIR 无关，固定按家目录判断）
$LegacyInstallDir = Join-Path $env:USERPROFILE ".wah"
$LegacyStateDir = Join-Path $env:USERPROFILE ".weixin-ai-connect-helper"

# 输出函数（注意：不要遮蔽内置的 Write-Error cmdlet）
function Write-Info { Write-Host $args -ForegroundColor Green }
function Write-Warn { Write-Host $args -ForegroundColor Yellow }
function Exit-WithError {
    # 用 throw 而不是 exit：irm | iex 场景下 exit 会直接关掉用户的 PowerShell 会话
    Write-Host $args -ForegroundColor Red
    throw ($args -join " ")
}

# 检测架构（只发布 amd64）；不支持的平台给出可读提示而不是 404
function Get-Arch {
    $arch = $env:PROCESSOR_ARCHITECTURE
    switch ($arch) {
        "AMD64" { return "amd64" }
        "ARM64" { Exit-WithError "暂无 Windows ARM64 的预编译包；请参考 README「从源码构建」自行编译。" }
        "x86"   { Exit-WithError "暂无 32 位 Windows 的预编译包；请在 64 位 PowerShell 中运行。" }
        default { Exit-WithError "不支持的架构: $arch" }
    }
}

# 获取最新 Release（保留完整对象，用于校验下载产物）
function Get-LatestRelease {
    try {
        return Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
    } catch {
        Exit-WithError "获取最新版本失败（网络问题或 GitHub 限流）: $($_.Exception.Message)"
    }
}

# 计算文件 sha256（用 .NET 实现，不依赖 Get-FileHash：部分机器禁用了模块自动加载）
function Get-Sha256Hex {
    param([string]$Path)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $stream = [System.IO.File]::OpenRead($Path)
        try {
            return ([BitConverter]::ToString($sha.ComputeHash($stream)) -replace '-', '').ToLower()
        } finally { $stream.Dispose() }
    } finally { $sha.Dispose() }
}

# 校验下载产物；拿不到 digest 时只告警，不影响安装
function Test-ArchiveChecksum {
    param([string]$Path, [string]$Name, $Assets)
    $asset = $Assets | Where-Object { $_.name -eq $Name } | Select-Object -First 1
    if (-not $asset -or -not $asset.digest) {
        Write-Warn "未能获取 $Name 的校验值，跳过完整性校验"
        return
    }
    $expected = ($asset.digest -replace '^sha256:', '').ToLower()
    $actual = Get-Sha256Hex -Path $Path
    if ($actual -ne $expected) {
        Exit-WithError "校验失败：$Name 的 sha256 与 Release 公布值不一致，已中止安装（下载损坏或被篡改）"
    }
    Write-Info "已校验 $Name 完整性（sha256）"
}

# 停止运行中的服务（wah stop 自身能容忍"未运行"状态）
function Stop-WahService {
    foreach ($wahExe in @(
        (Join-Path $InstallDir "$BinaryName.exe"),
        (Join-Path $LegacyInstallDir "$BinaryName.exe")
    )) {
        if (Test-Path $wahExe) {
            & $wahExe stop 2>$null | Out-Null
            Start-Sleep -Seconds 1
            return
        }
    }
}

# 从 PATH 移除安装目录（拆分后精确比较，容忍尾部反斜杠差异）
function Remove-FromPath {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath) {
        $newPath = ($userPath -split ";" | Where-Object {
            $_ -and ($_.TrimEnd('\') -ne $InstallDir) -and ($_.TrimEnd('\') -ne $LegacyInstallDir)
        }) -join ";"
        if ($newPath -ne $userPath) {
            [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        }
    }
    $env:Path = ($env:Path -split ";" | Where-Object {
        $_ -and ($_.TrimEnd('\') -ne $InstallDir) -and ($_.TrimEnd('\') -ne $LegacyInstallDir)
    }) -join ";"
}

# 安装
function Install-Wah {
    $arch = Get-Arch
    $release = Get-LatestRelease
    $version = $release.tag_name

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
        Test-ArchiveChecksum -Path $archivePath -Name $archiveName -Assets $release.assets

        # 解压
        Write-Info "正在解压..."
        Expand-Archive -Path $archivePath -DestinationPath $tmpDir -Force

        # 若旧版本正在运行，先停止，避免文件占用
        Stop-WahService

        # 程序目录和状态目录分离，升级/卸载不会触碰登录凭证与数据库。
        New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
        New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

        # 安装可执行文件
        Write-Info "正在安装到 $InstallDir..."
        Copy-Item (Join-Path $tmpDir "wah.exe") (Join-Path $InstallDir "$BinaryName.exe") -Force
        Copy-Item (Join-Path $tmpDir "pgh.exe") (Join-Path $InstallDir "pgh.exe") -Force

        # Web 控制台静态资源：与可执行文件同级的 app/web/dist（web-server.ts 的查找约定）
        $appSrc = Join-Path $tmpDir "app"
        if (Test-Path $appSrc) {
            $appDst = Join-Path $InstallDir "app"
            Remove-Item -Recurse -Force $appDst -ErrorAction SilentlyContinue
            Copy-Item -Recurse -Force $appSrc $appDst
        }

        # 配置文件仅在目标不存在时复制，避免重装覆盖用户修改
        foreach ($f in @("plugins.json", "bridge.config.json")) {
            $src = Join-Path $tmpDir $f
            $dst = Join-Path $StateDir $f
            if ((Test-Path $src) -and (-not (Test-Path $dst))) {
                Copy-Item $src $dst
            }
        }

        # 旧版把程序与状态都放在 ~/.wah；仅移除旧程序文件，保留状态数据。
        if ($LegacyInstallDir -ne $InstallDir) {
            Remove-Item -Force -Path (Join-Path $LegacyInstallDir "wah.exe") -ErrorAction SilentlyContinue
            Remove-Item -Force -Path (Join-Path $LegacyInstallDir "pgh.exe") -ErrorAction SilentlyContinue
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
    Write-Host "  状态: $StateDir"
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

    # 只删除明确安装的程序文件，状态数据默认保留。
    if (Test-Path $InstallDir) {
        Remove-Item -Force -Path (Join-Path $InstallDir "$BinaryName.exe") -ErrorAction SilentlyContinue
        Remove-Item -Force -Path (Join-Path $InstallDir "pgh.exe") -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force -Path (Join-Path $InstallDir "app") -ErrorAction SilentlyContinue
        Remove-Item -Force -Path (Join-Path $InstallDir "plugins.json") -ErrorAction SilentlyContinue
        Remove-Item -Force -Path (Join-Path $InstallDir "bridge.config.json") -ErrorAction SilentlyContinue
        Remove-Item -Force -Path $InstallDir -ErrorAction SilentlyContinue
        Write-Info "已删除程序文件: $InstallDir"
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

    Remove-FromPath

    Write-Info "卸载完成（登录凭证、配置、数据库和日志未删除）"
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
