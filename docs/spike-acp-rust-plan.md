# spike-acp-rust 实现计划

## 1. 目标

验证 Rust 官方 ACP SDK 能否替代当前 TypeScript ACP Client，稳定驱动本机 Coding Agent。

需要回答：

1. 能否启动 `opencode acp` 并完成 initialize？
2. 能否创建、复用 ACP Session？
3. 能否发送 prompt 并实时接收文本 chunk？
4. 能否处理 `request_permission`？
5. Agent 退出、超时、取消时能否可靠结束？
6. 能否安全传递 command、args、cwd 和 env，而不经过 shell 拼接？
7. Claude Code、Codex 的 ACP 适配器是否可复用同一实现？

## 2. 非目标

本 Spike 不实现：

- 微信接入
- SQLite
- 多用户路由
- 插件系统
- Web 控制台
- Session 跨进程恢复
- Agent 自动安装
- 完整 daemon
- ACP draft v2

第一版只使用稳定 ACP v1 wire protocol。

## 3. 建议依赖

```toml
[dependencies]
agent-client-protocol = "2"
tokio = { version = "1", features = ["full"] }
clap = { version = "4", features = ["derive"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
tracing = "0.1"
tracing-subscriber = "0.3"
uuid = { version = "1", features = ["v4"] }
```

正式开始前锁定具体版本并提交 `Cargo.lock`。

## 4. CLI 设计

```bash
cargo run -- \
  --command opencode \
  --arg acp \
  --cwd /path/to/project \
  --prompt "用一句中文回答：1+1等于几？" \
  --timeout 120 \
  --permission deny
```

支持参数：

```text
--command <path>
--arg <value>          可重复
--cwd <path>
--env KEY=VALUE        可重复
--prompt <text>
--timeout <seconds>
--permission deny|first-allow
--turns <number>
--trace <path>
```

必须使用明确的 executable 和 argv。禁止通过 `sh -c` 拼接命令。

## 5. 项目结构

```text
spike-acp-rust/
├── Cargo.toml
├── Cargo.lock
├── README.md
├── REPORT.md
├── src/
│   ├── main.rs
│   ├── cli.rs
│   ├── client.rs
│   ├── permission.rs
│   ├── collector.rs
│   ├── trace.rs
│   └── error.rs
├── tests/
└── fixtures/
```

- `cli.rs`：参数解析与校验。
- `client.rs`：启动 Agent、initialize、Session 和 prompt。
- `permission.rs`：权限决策。
- `collector.rs`：收集文本增量、stop reason 和执行时间。
- `trace.rs`：脱敏协议事件记录。
- `error.rs`：错误分类。

## 6. 实现阶段

### 阶段 A：最小闭环

完成：

```text
spawn agent
→ ACP initialize
→ session/new
→ session/prompt
→ 收集 agent_message_chunk
→ 获取 stop reason
→ dispose
```

验收：

- 输出非空回复。
- 打印 Agent 信息和协议版本。
- 进程退出后没有残留 Agent 子进程。

### 阶段 B：连续 Session

在同一 ActiveSession 连续发送：

```text
记住数字 42
刚才的数字是什么？
把它加 8
```

验收：

- 第二轮回答包含 42。
- 第三轮回答符合上下文。
- 三轮复用同一 Session ID。

### 阶段 C：权限请求

实现两种 policy：

- `deny`：全部拒绝。
- `first-allow`：选择 Agent 提供的第一个 allow 类选项。

测试时只允许读取 Spike 临时目录中的无害文件。

验收：

- deny 模式不会执行工具。
- allow 模式返回明确的 permission outcome。
- 没有可用选项时不会 panic。

### 阶段 D：失败、超时和取消

覆盖：

- Agent command 不存在。
- initialize 失败。
- Agent 在 prompt 中途退出。
- prompt 超时。
- Ctrl+C。
- 收到非文本 update。
- prompt 返回 error 但没有 stop update。

所有等待应同时监听：

```text
ACP update
prompt result
child exit
timeout
Ctrl+C
```

验收：

- 每种情况都能在有限时间内退出。
- 错误类型明确。
- 子进程被清理。
- 不出现永久等待。

### 阶段 E：多 Agent 兼容

配置可用时分别测试：

```text
opencode acp
claude-code-acp
codex-acp
```

记录 command、initialize response、capability、Session、permission、chunk 和 stop reason 差异。

## 7. 测试计划

单元测试：

- CLI argv 解析。
- permission option 选择。
- chunk 合并。
- timeout。
- error 映射。

集成测试：

- 提供假的 ACP Agent 子进程。
- 通过 stdin/stdout 输出固定 NDJSON。
- 模拟 initialize、chunk、permission、stop 和异常退出。

真实 Agent 测试必须显式运行，不进入普通 `cargo test`。

## 8. REPORT.md 内容

- 测试过的 Agent 及版本。
- 成功的 ACP 方法。
- 不兼容项。
- Agent 退出与取消行为。
- 是否建议采用 Rust 官方 SDK。
- 正式实现仍需补充的能力。

## 9. Go/No-Go 标准

### Go

- 至少一个真实 Agent 完成三轮对话。
- permission 请求可控。
- chunk 可以稳定接收。
- timeout 和 Agent exit 不会挂死。
- Ctrl+C 后没有残留子进程。

### No-Go

- 官方 SDK 无法兼容目标 Agent。
- 必须大量绕过 SDK 操作内部 JSON-RPC。
- Agent 退出后无法可靠终止连接。
- 各目标 Agent 的 wire 行为无法通过统一适配层处理。

## 10. 预计工作量

AI 辅助下约 1–2 天。
