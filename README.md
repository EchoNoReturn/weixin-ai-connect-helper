# weixin-ai-connect-helper

在微信里直接使用本机的 AI Coding Agent（opencode / Claude Code / Codex）。

架构与设计文档见 **[DESIGN.md](./DESIGN.md)**。

## 原理

复用 `@tencent-weixin/openclaw-weixin` 的微信协议层（扫码登录 + 长轮询收发），
本进程作为 **ACP 客户端**（无头版 Zed 的角色）驱动本机的
`opencode acp` / `claude-code-acp` / `codex-acp`，把 agent 的回复流式发回微信。

## 环境要求

- [Bun](https://bun.sh) ≥ 1.1（从源码安装时需要）
- Node.js 18+（部分依赖需要）
- 微信 bot 账号（首次启动扫码登录）
- 已安装的 Agent 工具（opencode / claude-code / codex）

## 快速安装（推荐）

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/EchoNoReturn/weixin-ai-connect-helper/main/install.sh | bash
```

安装脚本会自动：
- 检测你的系统架构（Intel/Apple Silicon）
- 下载最新版本
- 安装到 `~/.local/bin` 目录

自定义安装目录：
```bash
INSTALL_DIR=/usr/local/bin curl -fsSL https://raw.githubusercontent.com/EchoNoReturn/weixin-ai-connect-helper/main/install.sh | bash
```

卸载：
```bash
~/.local/bin/wah uninstall
# 或
curl -fsSL https://raw.githubusercontent.com/EchoNoReturn/weixin-ai-connect-helper/main/install.sh | bash -s -- --uninstall
```

### Windows

在 PowerShell 中运行：
```powershell
irm https://raw.githubusercontent.com/EchoNoReturn/weixin-ai-connect-helper/main/install.ps1 | iex
```

卸载：
```powershell
~\AppData\Local\wah\wah.exe uninstall
```

### 手动安装

从 [Releases](https://github.com/EchoNoReturn/weixin-ai-connect-helper/releases) 页面下载对应平台的压缩包，解压后将可执行文件放入 PATH 目录。

| 文件 | 系统 | 架构 |
|------|------|------|
| `wah-linux-amd64.tar.gz` | Linux | x86_64 |
| `wah-darwin-arm64.tar.gz` | macOS | Apple Silicon (M1/M2/M3) |
| `wah-windows-amd64.exe.zip` | Windows | x86_64 |

## 从源码安装

```bash
# 克隆仓库
git clone https://github.com/EchoNoReturn/weixin-ai-connect-helper.git
cd weixin-ai-connect-helper

# 安装依赖
bun install

# 手动创建 workspace 链接（bun workspace 有时需要）
mkdir -p node_modules/@yoyojcoder-weixin-ai
ln -sf ../../packages/core node_modules/@yoyojcoder-weixin-ai/core
ln -sf ../../packages/transport node_modules/@yoyojcoder-weixin-ai/transport
ln -sf ../../packages/orchestration node_modules/@yoyojcoder-weixin-ai/orchestration
ln -sf ../../packages/agent node_modules/@yoyojcoder-weixin-ai/agent
ln -sf ../../packages/plugins node_modules/@yoyojcoder-weixin-ai/plugins
```

## 快速开始

### 首次使用

```bash
# 1. 启动服务（首次运行会显示微信登录二维码）
wah start

# 2. 用微信扫描终端中的二维码完成登录
```

### 命令行使用

```bash
# 查看帮助
wah --help

# 查看版本
wah --version

# 启动桥接服务（默认同时启动 Web 控制台）
wah start

# 前台运行（调试用）
wah start --foreground

# 只启动桥，不开 Web 控制台
wah start --no-web

# 指定 Web 控制台端口
wah start --port 8080

# 查看连接状态
wah status

# 停止服务
wah stop

# 重启服务
wah restart

# 登录/重新登录微信
wah auth login

# 登出微信
wah auth logout
```

> 💡 **从源码运行时**，使用 `bun start` 或 `bun run cli` 代替 `wah`

### 插件管理

```bash
# 列出已注册插件及状态
wah plugins list

# 启用插件
wah plugins enable session-notify

# 禁用插件
wah plugins disable session-notify
```

## 在微信中使用

给绑定的 bot 发消息：

```
帮我看一下 CodeSpace 目录下有哪些项目        ← 默认走 opencode
/cc 用一句话解释 ACP 协议                    ← /cc 切换到 Claude Code
/oc 继续刚才的任务                             ← /oc 切换回 opencode
/cx 写一个 Python 脚本                        ← /cx 切换到 Codex
```

## 配置

### bridge.config.json

项目根目录创建 `bridge.config.json`（全部可选，有默认值）：

```jsonc
{
  "allowFrom": [],               // 微信用户 ID 白名单，空=自动绑定首个用户
  "defaultAgent": "opencode",    // 无前缀消息的默认 agent
  "agents": {
    "opencode": {
      "command": "opencode",
      "args": ["acp"],
      "cwd": ".",
      "notifyPolicy": "none"     // "none" | "own" | "all"
    }
  },
  "autoApprove": true,           // 自动批准 agent 权限请求（PoC）
  "webPort": 3210,               // Web 控制台端口
  "pluginsFile": "plugins.json", // 插件配置文件
  "streamFlushMinChars": 200,    // 流式合并：最小字符数
  "streamFlushIdleMs": 3000      // 流式合并：空闲时间（ms）
}
```

### plugins.json

按 hook 分组注册插件，数组顺序 = 执行顺序：

```jsonc
{
  "onReceive": [
    { "name": "message-filter", "enabled": true, "entry": "@yoyojcoder-weixin-ai/plugins/src/message-filter.ts" }
  ],
  "onRoute": [],
  "beforePrompt": [
    { "name": "system-prompt", "enabled": true, "entry": "@yoyojcoder-weixin-ai/plugins/src/system-prompt.ts" }
  ],
  "onPrompt": [],
  "onSessionEnd": [
    { "name": "session-notify", "enabled": false, "entry": "@yoyojcoder-weixin-ai/plugins/src/session-notify.ts" }
  ],
  "beforeSend": []
}
```

## 测试

```bash
# 全部测试
bun test

# 只跑单元测试
bun run test:unit

# 只跑集成测试
bun run test:integration

# ACP 冒烟测试（需要 opencode 已安装）
bun run test:acp
```

## 开发

```bash
# 启动桥（开发模式）
bun run dev

# 启动 Web 控制台开发服务器（Vite dev server）
bun run dev:web

# 类型检查
bun run typecheck
```

## 打包

```bash
# 编译为独立可执行文件
bun run build

# 产物：dist/weixin-ai-connect-helper
# 需要 node_modules/ 在同级目录下运行
./dist/weixin-ai-connect-helper --help
./dist/weixin-ai-connect-helper start
```

打包方式：`bun build --compile` 将 TypeScript 源码编译为二进制，npm 包标记为 external（运行时从 `node_modules/` 加载）。


## 项目结构

```
weixin-ai-connect-helper/
├── src/
│   ├── cli/                ← CLI 入口 + 子命令
│   ├── bridge.ts           ← 桥接核心逻辑
│   ├── config.ts           ← 配置加载
│   ├── env.ts              ← 环境变量设置
│   └── web-server.ts       ← Web 子进程管理
├── packages/
│   ├── core/               ← 管道引擎 + 类型 + 插件系统
│   ├── transport/          ← 微信收发（openclaw-weixin 封装）
│   ├── orchestration/      ← 路由 + context + session 管理
│   ├── agent/              ← ACP 客户端 + 进程管理
│   └── plugins/            ← 内置插件
├── app/
│   └── web/                ← React + Vite 控制台（独立前端）
├── scripts/                ← 测试脚本
└── types/                  ← 深导入类型声明
```

## 许可

MIT
