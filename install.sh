#!/bin/bash
set -e

# WeChat AI Connect Helper - 自动安装脚本
# 支持 macOS (arm64/amd64) 和 Linux (amd64)

REPO="EchoNoReturn/weixin-ai-connect-helper"
BINARY_NAME="wah"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

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

# 获取最新版本
get_latest_version() {
    local version
    version=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | cut -d '"' -f 4)
    
    if [ -z "$version" ]; then
        error "无法获取最新版本"
    fi
    
    echo "$version"
}

# 下载并安装
install() {
    local platform version url tmp_dir archive_name
    
    platform=$(detect_platform)
    version=$(get_latest_version)
    
    info "检测到平台: ${platform}"
    info "最新版本: ${version}"
    
    # 构建下载 URL
    archive_name="${BINARY_NAME}-${platform}.tar.gz"
    url="https://github.com/${REPO}/releases/download/${version}/${archive_name}"
    
    info "下载地址: ${url}"
    
    # 创建临时目录
    tmp_dir=$(mktemp -d)
    trap "rm -rf $tmp_dir" EXIT
    
    # 下载
    info "正在下载..."
    curl -L -o "${tmp_dir}/${archive_name}" "$url"
    
    # 解压
    info "正在解压..."
    tar -xzf "${tmp_dir}/${archive_name}" -C "${tmp_dir}"
    
    # 创建安装目录
    mkdir -p "${INSTALL_DIR}"
    
    # 安装文件
    info "正在安装到 ${INSTALL_DIR}..."
    cp "${tmp_dir}/wah" "${INSTALL_DIR}/${BINARY_NAME}"
    cp "${tmp_dir}/pgh" "${INSTALL_DIR}/pgh"
    cp "${tmp_dir}/package.json" "${INSTALL_DIR}/"
    cp "${tmp_dir}/plugins.json" "${INSTALL_DIR}/"
    
    # 设置执行权限
    chmod +x "${INSTALL_DIR}/${BINARY_NAME}"
    chmod +x "${INSTALL_DIR}/pgh"
    
    # 检查 PATH
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        warn "安装目录 ${INSTALL_DIR} 不在 PATH 中"
        warn "请将以下内容添加到 ~/.bashrc 或 ~/.zshrc:"
        echo ""
        echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
        echo ""
    fi
    
    info "安装完成！"
    echo ""
    echo "  版本: ${version}"
    echo "  位置: ${INSTALL_DIR}/${BINARY_NAME}"
    echo ""
    echo "  使用方法:"
    echo "    ${BINARY_NAME} start    # 启动服务"
    echo "    ${BINARY_NAME} --help   # 查看帮助"
    echo ""
}

# 卸载
uninstall() {
    local install_dir="${INSTALL_DIR}"
    
    info "正在卸载..."
    
    rm -f "${install_dir}/${BINARY_NAME}"
    rm -f "${install_dir}/pgh"
    rm -f "${install_dir}/package.json"
    rm -f "${install_dir}/plugins.json"
    
    info "卸载完成"
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
            echo "  INSTALL_DIR  安装目录 (默认: ~/.local/bin)"
            ;;
        *)
            check_deps
            install
            ;;
    esac
}

main "$@"
