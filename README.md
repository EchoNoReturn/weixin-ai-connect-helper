# weixin-ai-connect-helper

在微信里直接使用本机的 AI Coding Agent（opencode / Claude Code / Codex）。

架构与设计文档见 **[DESIGN.md](./DESIGN.md)**。

## 原理

复用 `@tencent-weixin/openclaw-weixin` 的微信协议层（扫码登录 + 长轮询收发），
本进程作为 **ACP 客户端**（无头版 Zed 的角色）驱动本机的
`opencode acp` / `claude-code-acp` / `codex-acp`，把 agent 的回复流式发回微信。

## 环境要求

- [Bun](https://bun.sh) ≥ 1.1（从源码安装时需要）
- Node.js 22+（`@tencent-weixin/openclaw-weixin` 2.4.6 的最低要求）
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
- 将程序安装到 `~/.local/bin`，将登录凭证、配置、数据库和日志保存在 `~/.wah`
- 自动配置 PATH 环境变量

自定义安装目录：
```bash
INSTALL_DIR=/usr/local/bin curl -fsSL https://raw.githubusercontent.com/EchoNoReturn/weixin-ai-connect-helper/main/install.sh | bash
```

可通过 `BRIDGE_STATE_DIR` 自定义状态目录。卸载只删除程序文件，默认保留状态数据。

卸载：
```bash
curl -fsSL https://raw.githubusercontent.com/EchoNoReturn/weixin-ai-connect-helper/main/uninstall.sh | bash
```

### Windows

在 PowerShell 中运行：
```powershell
irm https://raw.githubusercontent.com/EchoNoReturn/weixin-ai-connect-helper/main/install.ps1 | iex
```

程序默认安装到 `%LOCALAPPDATA%\Programs\wah`，状态数据保存在 `%USERPROFILE%\.wah`；卸载默认保留状态数据。

卸载：
```powershell
irm https://raw.githubusercontent.com/EchoNoReturn/weixin-ai-connect-helper/main/uninstall.ps1 | iex
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

<p align="center">
  <img src="https://github.com/EchoNoReturn/weixin-ai-connect-helper/blob/main/wah.gif" width="600" alt="Demo">
</p>

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

# 查看待审批的微信用户
wah access list pending

# 批准或撤销用户访问
wah access approve '<user-id>@im.wechat'
wah access revoke '<user-id>@im.wechat'
```

## 在微信中使用

给绑定的 bot 发消息：

```
帮我看一下 CodeSpace 目录下有哪些项目        ← 默认走 opencode
/cc 用一句话解释 ACP 协议                    ← /cc 切换到 Claude Code
/oc 继续刚才的任务                             ← /oc 切换回 opencode
/cx 写一个 Python 脚本                        ← /cx 切换到 Codex
```

每次启动会向登录记录中的扫码用户发送一条自检通知，包含启动时间、时区、操作系统、主机名和主机用户名。通知成功表示微信发送接口调用成功，不代表 Agent 已启动。桥接会保存各账号、用户的回复上下文以便重启后使用；若启动发送失败，会记录原因，并在登录用户下次发消息时携带最新上下文补发。旧登录记录缺少用户 ID 时会提示重新登录，不会把主机信息发给其他用户。

消息处理失败时会回复失败提示和错误编号，详细错误与堆栈保存在本机日志中。未授权用户会收到本机审批说明；Agent 返回空内容也会收到提示。如果微信发送本身失败，失败提示也可能无法送达，此时查看 `wah status` 指示的日志文件。

测试通过 `bunfig.toml` 的 preload 使用系统临时目录中的独立状态目录，不会把测试日志和会话写入日常使用的 `~/.wah`。

## 配置

### Agent 工具权限

`autoApprove` 默认是 `false`。开启后自动批准 Agent 通过 ACP 发出的文件访问、命令执行等权限请求；关闭时把权限请求转发微信，等待用户选择。此设置不绕过操作系统或 Agent 自身的权限限制，也不改变微信用户的 `allowFrom` / `wah access approve` 访问控制。

三种方式修改同一个设置，保存后均需重启桥接：

- CLI：`wah permissions enable` 开启，`wah permissions disable` 关闭，`wah permissions status` 查看已保存设置和配置文件位置。源码运行使用 `bun run cli permissions enable` 等。
- 配置文件：在 `bridge.config.json` 中设置 `"autoApprove": true` 或 `false`。
- Web 控制台：进入 **Settings → 基础**，勾选或取消“自动批准所有 Agent 工具权限”，然后保存。

执行 `wah restart`（源码使用 `bun run cli restart`）后，新的权限策略生效。

### 在微信回答 Agent 的问题

权限提示会展示申请的 Agent 及启动程序、你的任务背景、操作类型（读取、修改、删除、执行命令等）、目标路径和 Agent 提供的用途说明；若提供命令、参数或文件变更，也会一并显示。桥接会合并同一工具调用此前的详情。Agent 未提供的权限类型或用途会明确标注，不会根据目录名推断为只读操作。

Agent 发起 ACP 权限请求或会话内表单提问时，桥接会立即发送问题和选项，例如：

```text
[需要你决定]
Agent：opencode
请选择实现方案
1. 方案 A
2. 方案 B

直接回复数字或答案即可；回复“取消”结束本次等待。
```

直接回复 `2` 选择方案 B，文字问题直接回复答案，无需指令或问题编号；多选用 `1,3`，可选字段回复“跳过”。错误答案会提示重填。相同用户、渠道和会话中的多个问题按顺序逐个展示，每次回复回答当前展示的问题。等待期间的回复直接交给问题，不会排在被阻塞的任务后面；没有待回答问题时按普通对话处理。

每个问题等待 5 分钟，超时、取消、Agent 断开或桥接停止时取消等待，不会默认同意。`autoApprove=true` 只自动批准工具权限，**不会替用户回答方案选择等表单提问**。普通对话中的文字追问仍直接回复即可。

当前支持 ACP `session/request_permission` 和 SDK 1.3.0 的实验性 `elicitation/create` 表单模式；后者取决于 Agent 是否实现。URL 模式、尚无会话的提问、Agent 私有终端交互不在支持范围。本地 Webhook 是请求—响应渠道，暂不等待此类交互，会返回说明并取消请求。

### bridge.config.json

项目根目录创建 `bridge.config.json`（全部可选，有默认值）：

```jsonc
{
  "allowFrom": [],               // 微信用户 ID 白名单；空=使用本机 access 审批记录
  "defaultAgent": "opencode",    // 无前缀消息的默认 agent
  "agents": {
    "opencode": {
      "command": "opencode",
      "args": ["acp"],
      "cwd": ".",
      "notifyPolicy": "none"     // "none" | "own" | "all"
    }
  },
  "autoApprove": false,          // 是否自动批准 agent 权限请求
  "webPort": 3210,               // Web 控制台端口
  "pluginsFile": "plugins.json", // 插件配置文件
  "streamFlushMinChars": 200,    // 流式合并：最小字符数
  "streamFlushIdleMs": 3000,     // 流式合并：空闲时间（ms）
  "channels": [
    { "type": "weixin", "id": "weixin-main", "enabled": true }
    // 备用本地入口：{ "type": "webhook", "id": "webhook-local", "port": 3211 }
  ]
}
```

`channels` 可以同时启用多个接入。Webhook 接收 `POST /v1/messages`，请求体为
`{"senderId":"local-user","text":"..."}`。默认只监听 `127.0.0.1`；监听其他地址时必须配置
`tokenEnv`，并通过对应环境变量提供 Bearer Token。Webhook 用户的审批键为
`<channel-id>:<sender-id>`。

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

# 产物：dist/wah
./dist/wah --help
./dist/wah start
```

打包方式：`bun build --compile` 将 TypeScript 源码编译为单个二进制文件，所有依赖打包在内，无需 node_modules。


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
