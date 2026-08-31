#!/bin/bash
set -e

# WeChat AI Connect Helper - 卸载脚本
# 支持 macOS 和 Linux

INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
STATE_DIR="${BRIDGE_STATE_DIR:-$HOME/.wah}"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# 停止服务
stop_service() {
    local wah_bin="${INSTALL_DIR}/wah"
    if [ ! -f "$wah_bin" ] && [ -f "$HOME/.wah/wah" ]; then
        wah_bin="$HOME/.wah/wah"
    fi

    if [ ! -f "$wah_bin" ]; then
        return
    fi
    
    # 检查是否有 PID 文件
    local pid_file="${STATE_DIR}/bridge.pid"
    if [ ! -f "$pid_file" ]; then
        return
    fi
    
    local pid=$(cat "$pid_file" 2>/dev/null || true)
    if [ -z "$pid" ]; then
        return
    fi
    
    # 检查进程是否在运行
    if kill -0 "$pid" 2>/dev/null; then
        info "检测到服务正在运行 (PID: $pid)，正在停止..."
        "$wah_bin" stop 2>/dev/null || true
        sleep 1
    fi
}

# 卸载
uninstall() {
    info "正在卸载 weixin-ai-connect-helper..."
    
    # 先停止服务
    stop_service
    
    # 只删除本项目明确安装的文件。INSTALL_DIR 可能是 /usr/local/bin 等共享目录，
    # 绝不能递归删除整个目录。登录凭证、配置、数据库和日志默认保留。
    rm -f \
        "${INSTALL_DIR}/wah" \
        "${INSTALL_DIR}/pgh"
    if [ "${INSTALL_DIR}" != "$HOME/.wah" ]; then
        rm -f "$HOME/.wah/wah" "$HOME/.wah/pgh"
    fi
    rmdir "${INSTALL_DIR}" 2>/dev/null || true
    info "已删除程序文件: ${INSTALL_DIR}"
    if [ -d "${STATE_DIR}" ]; then
        info "已保留状态数据: ${STATE_DIR}"
    fi
    
    # 从 shell 配置文件中移除 PATH
    local removed_from=""
    for shell_config in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; do
        if [ -f "$shell_config" ] && { grep -Fq "$INSTALL_DIR" "$shell_config" 2>/dev/null || grep -Fq '$HOME/.wah' "$shell_config" 2>/dev/null; }; then
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
    
    info "卸载完成！登录凭证、配置、数据库和日志未删除"
    echo ""
    echo "  注意: 可能需要重启终端才能使更改生效"
    echo ""
}

# 主函数
main() {
    case "${1:-}" in
        help|--help|-h)
            echo "WeChat AI Connect Helper 卸载脚本"
            echo ""
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  (无)         卸载程序"
            echo "  -h, help     显示帮助"
            echo ""
            echo "环境变量:"
            echo "  INSTALL_DIR      程序目录 (默认: ~/.local/bin)"
            echo "  BRIDGE_STATE_DIR 状态目录 (默认: ~/.wah)"
            echo ""
            echo "快速卸载:"
            echo "  curl -fsSL https://raw.githubusercontent.com/EchoNoReturn/weixin-ai-connect-helper/main/uninstall.sh | bash"
            echo ""
            ;;
        *)
            uninstall
            ;;
    esac
}

main "$@"
