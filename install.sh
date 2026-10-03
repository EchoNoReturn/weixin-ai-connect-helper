#!/bin/bash
set -e

# WeChat AI Connect Helper - 自动安装脚本
# 支持 macOS (arm64/amd64) 和 Linux (amd64)

REPO="EchoNoReturn/weixin-ai-connect-helper"
BINARY_NAME="wah"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
STATE_DIR="${BRIDGE_STATE_DIR:-$HOME/.wah}"

# 与 release 产物一一对应；不在此列表内的平台没有预编译包
SUPPORTED_PLATFORMS="linux-amd64 darwin-arm64"
RELEASE_API="https://api.github.com/repos/${REPO}/releases/latest"
RELEASE_JSON=""
LATEST_VERSION=""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# 检测操作系统和架构
detect_platform() {
    local os arch
    
    case "$(uname -s)" in
        Linux*)     os="linux" ;;
        Darwin*)    os="darwin" ;;
        *)          error "不支持的操作系统: $(uname -s)"
    esac
    
    case "$(uname -m)" in
        x86_64|amd64)   arch="amd64" ;;
        arm64|aarch64)  arch="arm64" ;;
        *)              error "不支持的架构: $(uname -m)"
    esac
    
    echo "${os}-${arch}"
}

# 没有预编译包的平台直接给出可读提示，而不是让 curl 抛 404
assert_supported_platform() {
    case " ${SUPPORTED_PLATFORMS} " in
        *" $1 "*) ;;
        *)  error "暂无 $1 的预编译包。\n  当前已发布: ${SUPPORTED_PLATFORMS}\n  Intel Mac / ARM Linux 等平台请参考 README「从源码构建」自行编译。" ;;
    esac
}

# 计算文件 sha256（优先 sha256sum，macOS 用 shasum）
sha256_of() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | cut -d ' ' -f 1
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | cut -d ' ' -f 1
    else
        return 1
    fi
}

# 从 Release JSON 里取出指定资产的 digest（GitHub 提供的 sha256）
# 注意：资产对象里嵌了 uploader 子对象，不能按 { 切分后要求 name/digest 同行，
# 因此改成逐行状态机：定位到该资产后向下找 digest，遇到下一个 name 就停。
asset_digest() {
    printf '%s\n' "$RELEASE_JSON" | awk -v name="$1" '
        !seen && (index($0, "\"name\": \"" name "\"") > 0 || index($0, "\"name\":\"" name "\"") > 0) { seen = 1 }
        seen && !done && $0 ~ /"name": ?"/ && (index($0, name) == 0) { done = 1 }
        seen && !done && match($0, /sha256:[0-9a-f]{64}/) { print substr($0, RSTART, RLENGTH); exit }
    '
}

# 校验下载产物；拿不到 digest 或缺校验工具时只告警，不影响安装
verify_checksum() {
    local file="$1" name="$2" expected actual
    expected=$(asset_digest "$name")
    if [ -z "$expected" ]; then
        warn "未能获取 ${name} 的校验值，跳过完整性校验"
        return 0
    fi
    if ! actual=$(sha256_of "$file"); then
        warn "缺少 sha256sum/shasum，跳过完整性校验"
        return 0
    fi
    if [ "${expected#sha256:}" != "$actual" ]; then
        error "校验失败：${name} 的 sha256 与 Release 公布值不一致，已中止安装（下载损坏或被篡改）"
    fi
    info "已校验 ${name} 完整性（sha256）"
}

# 检查依赖
check_deps() {
    local missing=()
    
    for cmd in curl tar; do
        if ! command -v $cmd &> /dev/null; then
            missing+=($cmd)
        fi
    done
    
    if [ ${#missing[@]} -gt 0 ]; then
        error "缺少依赖: ${missing[*]}"
    fi
}

# 拉取最新 Release；必须在当前 shell 调用（不能放 $( ) 里，否则 RELEASE_JSON 会丢在子 shell）
fetch_latest_release() {
    RELEASE_JSON=$(curl -s "${RELEASE_API}")
    LATEST_VERSION=$(printf '%s' "$RELEASE_JSON" | grep '"tag_name"' | cut -d '"' -f 4)
    
    if [ -z "$LATEST_VERSION" ]; then
        error "无法获取最新版本（GitHub API 限流或仓库暂无 Release）"
    fi
}

# 选一个当前 shell 真正会读取的配置文件（bash 用户不应写到 ~/.zshrc）
shell_config_for_path() {
    local shell_name
    shell_name=$(basename "${SHELL:-}")
    
    if [ -n "${ZSH_VERSION:-}" ] || [ "$shell_name" = "zsh" ]; then
        echo "$HOME/.zshrc"
        return
    fi
    if [ -n "${BASH_VERSION:-}" ] || [ "$shell_name" = "bash" ]; then
        if [ -f "$HOME/.bashrc" ]; then
            echo "$HOME/.bashrc"
        else
            echo "$HOME/.bash_profile"
        fi
        return
    fi
    # 无法判断当前 shell：退回到已存在的第一个配置文件
    local candidate
    for candidate in "$HOME/.profile" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.zshrc"; do
        if [ -f "$candidate" ]; then
            echo "$candidate"
            return
        fi
    done
}

# 停止由本程序启动的服务（依赖状态目录下的 bridge.pid）
stop_service() {
    local wah_bin="${INSTALL_DIR}/${BINARY_NAME}"
    if [ ! -f "$wah_bin" ]; then
        wah_bin="$HOME/.wah/${BINARY_NAME}"
    fi
    if [ ! -f "$wah_bin" ]; then
        return 0
    fi
    
    local pid_file="${STATE_DIR}/bridge.pid"
    if [ ! -f "$pid_file" ]; then
        return 0
    fi
    local pid
    pid=$(cat "$pid_file" 2>/dev/null || true)
    if [ -z "$pid" ]; then
        return 0
    fi
    if kill -0 "$pid" 2>/dev/null; then
        info "检测到服务正在运行 (PID: $pid)，正在停止..."
        "$wah_bin" stop 2>/dev/null || true
        sleep 1
    fi
}

# 移除安装时写入 shell 配置的 PATH 行
remove_path_from_shell_config() {
    local removed_from="" shell_config
    for shell_config in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; do
        if [ -f "$shell_config" ] && grep -Fq "$INSTALL_DIR" "$shell_config" 2>/dev/null; then
            local path_line="export PATH=\"${INSTALL_DIR}:\$PATH\""
            local legacy_line='export PATH="$HOME/.wah:$PATH"'
            local temp_config="${shell_config}.wah-uninstall.tmp"
            awk -v path_line="$path_line" -v legacy_line="$legacy_line" '
                $0 != "# WeChat AI Connect Helper" && $0 != path_line && $0 != legacy_line { print }
            ' "$shell_config" > "$temp_config"
            mv "$temp_config" "$shell_config"
            removed_from="$shell_config"
        fi
    done
    if [ -n "$removed_from" ]; then
        info "已从 ${removed_from} 移除 PATH 配置"
    fi
}

# 下载并安装
install() {
    local platform version url tmp_dir archive_name
    
    platform=$(detect_platform)
    assert_supported_platform "$platform"
    fetch_latest_release
    version="$LATEST_VERSION"
    
    info "检测到平台: ${platform}"
    info "最新版本: ${version}"
    
    # 构建下载 URL
    archive_name="${BINARY_NAME}-${platform}.tar.gz"
    url="https://github.com/${REPO}/releases/download/${version}/${archive_name}"
    
    info "下载地址: ${url}"
    
    # 创建临时目录
    tmp_dir=$(mktemp -d)
    trap "rm -rf -- '$tmp_dir'" EXIT
    
    # 下载
    info "正在下载..."
    curl --fail --show-error --location -o "${tmp_dir}/${archive_name}" "$url"
    verify_checksum "${tmp_dir}/${archive_name}" "$archive_name"
    
    # 解压
    info "正在解压..."
    tar -xzf "${tmp_dir}/${archive_name}" -C "${tmp_dir}"
    
    # 创建程序与状态目录
    mkdir -p "${INSTALL_DIR}"
    mkdir -p "${STATE_DIR}"
    
    # 安装文件
    info "正在安装到 ${INSTALL_DIR}..."
    cp "${tmp_dir}/wah" "${INSTALL_DIR}/${BINARY_NAME}"
    cp "${tmp_dir}/pgh" "${INSTALL_DIR}/pgh"
    # Web 控制台静态资源：与可执行文件同级的 app/web/dist（web-server.ts 的查找约定）
    if [ -d "${tmp_dir}/app" ]; then
        rm -rf "${INSTALL_DIR}/app"
        cp -R "${tmp_dir}/app" "${INSTALL_DIR}/app"
    fi
    if [ ! -f "${STATE_DIR}/plugins.json" ]; then
        cp "${tmp_dir}/plugins.json" "${STATE_DIR}/plugins.json"
    fi
    if [ -f "${tmp_dir}/bridge.config.json" ] && [ ! -f "${STATE_DIR}/bridge.config.json" ]; then
        cp "${tmp_dir}/bridge.config.json" "${STATE_DIR}/bridge.config.json"
    fi

    # 迁移旧版默认布局：仅删除旧的程序文件，保留 ~/.wah 下的用户状态。
    if [ "${INSTALL_DIR}" != "$HOME/.wah" ]; then
        rm -f "$HOME/.wah/wah" "$HOME/.wah/pgh"
    fi
    
    # 设置执行权限
    chmod +x "${INSTALL_DIR}/${BINARY_NAME}"
    chmod +x "${INSTALL_DIR}/pgh"
    
    # 自动配置 PATH
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        local shell_config=""
        local export_line="export PATH=\"${INSTALL_DIR}:\$PATH\""
        
        # 选当前 shell 真正会读取的配置文件
        shell_config=$(shell_config_for_path)
        
        if [ -n "$shell_config" ]; then
            # 检查是否已经配置过
            if ! grep -Fq "$INSTALL_DIR" "$shell_config" 2>/dev/null; then
                echo "" >> "$shell_config"
                echo "# WeChat AI Connect Helper" >> "$shell_config"
                echo "$export_line" >> "$shell_config"
                info "已自动添加 PATH 到 ${shell_config}"
            fi
            # 立即生效
            export PATH="$INSTALL_DIR:$PATH"
        else
            warn "未找到 shell 配置文件，请手动添加 PATH:"
            echo "  $export_line"
        fi
    fi
    
    info "安装完成！"
    echo ""
    echo "  版本: ${version}"
    echo "  位置: ${INSTALL_DIR}/${BINARY_NAME}"
    echo "  状态: ${STATE_DIR}"
    echo ""
    echo "  使用方法:"
    echo "    ${BINARY_NAME} start    # 启动服务"
    echo "    ${BINARY_NAME} --help   # 查看帮助"
    echo ""
    echo "  注意: 可能需要重启终端才能使用新命令"
    echo ""
}

# 卸载（与 uninstall.sh 行为保持一致：停服务、删程序、清 PATH、保留状态）
uninstall() {
    local install_dir="${INSTALL_DIR}"
    
    info "正在卸载..."
    
    stop_service
    
    rm -f "${install_dir}/${BINARY_NAME}"
    rm -f "${install_dir}/pgh"
    rm -rf "${install_dir}/app"
    if [ "${install_dir}" != "$HOME/.wah" ]; then
        rm -f "$HOME/.wah/wah" "$HOME/.wah/pgh"
    fi
    rmdir "${install_dir}" 2>/dev/null || true
    
    remove_path_from_shell_config
    
    info "卸载完成；状态数据保留在 ${STATE_DIR}"
}

# 主函数
main() {
    case "${1:-}" in
        uninstall|--uninstall|-u)
            uninstall
            ;;
        help|--help|-h)
            echo "WeChat AI Connect Helper 安装脚本"
            echo ""
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  (无)         安装程序"
            echo "  -u, uninstall 卸载程序"
            echo "  -h, help     显示帮助"
            echo ""
            echo "环境变量:"
            echo "  INSTALL_DIR      程序目录 (默认: ~/.local/bin)"
            echo "  BRIDGE_STATE_DIR 状态目录 (默认: ~/.wah)"
            ;;
        *)
            check_deps
            install
            ;;
    esac
}

main "$@"
