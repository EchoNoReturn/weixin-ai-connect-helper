#!/bin/bash
set -e

# WeChat AI Connect Helper - 卸载脚本
# 支持 macOS 和 Linux

INSTALL_DIR="${INSTALL_DIR:-$HOME/.wah}"
STATE_DIR="${BRIDGE_STATE_DIR:-$HOME/.weixin-ai-connect-helper}"

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
    
    # 检查 wah 是否存在
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
    
    # 删除安装目录
    if [ -d "${INSTALL_DIR}" ]; then
        rm -rf "${INSTALL_DIR}"
        info "已删除安装目录: ${INSTALL_DIR}"
    else
        warn "安装目录不存在: ${INSTALL_DIR}"
    fi
    
    # 删除状态目录
    if [ -d "${STATE_DIR}" ]; then
        rm -rf "${STATE_DIR}"
        info "已删除状态目录: ${STATE_DIR}"
    fi
    
    # 从 shell 配置文件中移除 PATH
    local removed_from=""
    for shell_config in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; do
        if [ -f "$shell_config" ] && grep -q '$HOME/.wah' "$shell_config" 2>/dev/null; then
            # 使用 sed 移除相关行
            sed -i.bak '/# WeChat AI Connect Helper/d' "$shell_config"
            sed -i.bak '/\$HOME\/\.wah/d' "$shell_config"
            # 删除备份文件
            rm -f "${shell_config}.bak"
            removed_from="$shell_config"
        fi
    done
    
    if [ -n "$removed_from" ]; then
        info "已从 ${removed_from} 移除 PATH 配置"
    fi
    
    info "卸载完成！"
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
            echo "  INSTALL_DIR  安装目录 (默认: ~/.wah)"
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
