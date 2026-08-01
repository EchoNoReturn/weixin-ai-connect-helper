# WeChat AI Connect Helper - Windows 安装脚本
# 使用方法: irm https://raw.githubusercontent.com/EchoNoReturn/weixin-ai-connect-helper/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

# 配置
$Repo = "EchoNoReturn/weixin-ai-connect-helper"
$BinaryName = "wah"
$InstallDir = Join-Path $env:LOCALAPPDATA "wah"

# 颜色函数
function Write-Info { Write-Host $args -ForegroundColor Green }
function Write-Warn { Write-Host $args -ForegroundColor Yellow }
function Write-Error { Write-Host $args -ForegroundColor Red; exit 1 }

# 检测架构
function Get-Arch {
    $arch = $env:PROCESSOR_ARCHITECTURE
    switch ($arch) {
        "AMD64" { return "amd64" }
        "ARM64" { return "arm64" }
        default { Write-Error "不支持的架构: $arch" }
    }
}

# 获取最新版本
function Get-LatestVersion {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
    return $release.tag_name
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
        Invoke-WebRequest -Uri $url -OutFile $archivePath
        
        # 解压
        Write-Info "正在解压..."
        Expand-Archive -Path $archivePath -DestinationPath $tmpDir -Force
        
        # 创建安装目录
        New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
        
        # 安装文件
        Write-Info "正在安装到 $InstallDir..."
        Copy-Item (Join-Path $tmpDir "wah.exe") (Join-Path $InstallDir "$BinaryName.exe") -Force
        Copy-Item (Join-Path $tmpDir "pgh.exe") (Join-Path $InstallDir "pgh.exe") -Force
        Copy-Item (Join-Path $tmpDir "package.json") $InstallDir -Force
        Copy-Item (Join-Path $tmpDir "plugins.json") $InstallDir -Force
        
    } finally {
        # 清理
        Remove-Item -ItemType Directory -Force -Path $tmpDir -ErrorAction SilentlyContinue
    }
    
    # 添加到 PATH
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$InstallDir*") {
        Write-Warn "正在添加安装目录到 PATH..."
        [Environment]::SetEnvironmentVariable("Path", "$currentPath;$InstallDir", "User")
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
    Write-Host "  注意: 可能需要重启终端才能使用新命令"
    Write-Host ""
}

# 卸载
function Uninstall-Wah {
    Write-Info "正在卸载..."
    
    if (Test-Path $InstallDir) {
        Remove-Item -ItemType Directory -Force -Path $InstallDir
    }
    
    # 从 PATH 移除
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $newPath = ($currentPath -split ";" | Where-Object { $_ -ne $InstallDir }) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    
    Write-Info "卸载完成"
}

# 主函数
function Main {
    param(
        [switch]$Uninstall,
        [switch]$Help
    )
    
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
        Write-Host "快速安装（管理员 PowerShell）:"
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

Main @PSBoundParameters
