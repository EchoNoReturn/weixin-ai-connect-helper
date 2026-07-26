# weixin-ai-connect-helper

在微信里直接使用本机的 AI Coding Agent（opencode / Claude Code / Codex）。

架构与设计文档见 **[DESIGN.md](./DESIGN.md)**。

## 原理（一句话）

复用 `@tencent-weixin/openclaw-weixin` 的微信协议层（扫码登录 + 长轮询收发），
本进程作为 **ACP 客户端**（无头版 Zed 的角色）驱动本机的
`opencode acp` / `claude-code-acp` / `codex-acp`，把 agent 的回复流式发回微信。

## 快速开始

```bash
bun install

# 冒烟测试：不依赖微信，直接驱动 opencode acp 回答一个问题
bun run test:acp

# 启动桥（首次运行会在终端打印微信登录二维码，扫码后常驻）
bun start
```

## 使用

在微信里给绑定的 bot 发消息：

```
帮我看一下 CodeSpace 目录下有哪些项目        ← 默认走 opencode
/cc 用一句话解释 ACP 协议                    ← /cc 切换到 Claude Code
/oc 继续刚才的任务                             ← /oc 切换回 opencode
```

## 配置

可选：项目根目录新建 `bridge.config.json`，字段见 [DESIGN.md §5](./DESIGN.md)。
默认：自动绑定第一个发来消息的微信用户，自动批准 agent 权限请求（PoC 行为）。
