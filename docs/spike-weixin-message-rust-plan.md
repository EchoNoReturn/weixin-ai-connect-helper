# spike-weixin-message-rust 实现计划

## 1. 目标

使用 Rust 和已有微信凭证完成：

```text
长轮询接收文本消息
→ 标准化
→ 固定前缀回显
→ 携带原消息 contextToken
```

需要回答：

1. Rust 能否正常调用 `getUpdates`？
2. `get_updates_buf` 是否能跨重启恢复？
3. 能否正确解析文本消息？
4. 能否用相同凭证调用 `sendMessage`？
5. `contextToken` 是否可以逐消息可靠传递？
6. 多条并发消息是否会串 token？
7. 如何避免保存游标后崩溃造成消息丢失？
8. 服务端是否可能重复投递？

## 2. 前置条件

凭证来源优先级：

1. `spike-weixin-login-rust` 输出的凭证。
2. 手工创建的 Spike 凭证文件。
3. 显式环境变量。

```text
WAH_SPIKE_WEIXIN_TOKEN
WAH_SPIKE_WEIXIN_ACCOUNT_ID
WAH_SPIKE_WEIXIN_BASE_URL
```

不得默认读取或修改正式 `~/.wah`。

## 3. 非目标

- ACP Agent
- Agent 路由
- system prompt
- 图片和文件
- Web 控制台
- 多 bot 账号
- 完整消息格式支持
- 生产限流策略
- 插件系统

回复只做安全 echo：

```text
[spike echo] 你发送了：hello
```

用户文本绝不能作为 shell 命令执行。

## 4. 建议依赖

```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
clap = { version = "4", features = ["derive"] }
thiserror = "2"
tracing = "0.1"
tracing-subscriber = "0.3"
uuid = { version = "1", features = ["v4"] }
rusqlite = { version = "0.32", features = ["bundled"] }
sha2 = "0.10"
```

## 5. CLI 设计

```bash
cargo run -- \
  --credentials ./tmp/state/accounts/account.json \
  --state-dir ./tmp/message-state \
  --echo \
  --poll-timeout 35
```

支持：

```text
--credentials <path>
--state-dir <path>
--poll-timeout <seconds>
--echo
--dry-run-send
--once
--dump-redacted-fixture <path>
--crash-after-persist
--crash-before-send
--crash-after-send-before-ack
```

## 6. 核心数据类型

```rust
struct RawUpdateBatch {
    next_sync_buf: String,
    messages: Vec<RawWeixinMessage>,
}

struct InboundMessage {
    idempotency_key: String,
    from_user_id: String,
    text: String,
    context_token: Option<String>,
    raw_json: serde_json::Value,
}

struct OutboundMessage {
    to_user_id: String,
    text: String,
    context_token: Option<String>,
    client_id: String,
}
```

`context_token` 必须始终属于具体消息。禁止使用全局 `HashMap<user_id, token>`。

## 7. 项目结构

```text
spike-weixin-message-rust/
├── Cargo.toml
├── Cargo.lock
├── README.md
├── REPORT.md
├── src/
│   ├── main.rs
│   ├── cli.rs
│   ├── credentials.rs
│   ├── http.rs
│   ├── inbound.rs
│   ├── outbound.rs
│   ├── store.rs
│   ├── model.rs
│   ├── redact.rs
│   └── error.rs
├── tests/
├── migrations/
└── fixtures/
```

## 8. 最小可靠性存储

为验证当前项目最重要的消息丢失问题，Spike 直接实现最小 SQLite inbox：

```sql
CREATE TABLE transport_state (
    account_id TEXT PRIMARY KEY,
    sync_buf TEXT NOT NULL
);

CREATE TABLE inbox (
    idempotency_key TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    from_user_id TEXT NOT NULL,
    context_token TEXT,
    text TEXT NOT NULL,
    raw_json TEXT NOT NULL,
    status TEXT NOT NULL,
    received_at INTEGER NOT NULL,
    processed_at INTEGER
);
```

收到 polling response 后，在同一事务中：

1. 插入 batch 内的消息。
2. 更新 `sync_buf`。
3. commit。
4. worker 消费 `status = pending` 的 inbox。

这样进程在发送前崩溃，重启后仍能继续处理本地 pending 消息。

## 9. 幂等键策略

优先使用服务端稳定消息 ID 或 client ID。

如果真实响应没有稳定 ID，临时使用 hash：

```text
accountId
+ fromUserId
+ contextToken
+ message type
+ normalized content
+ server timestamp（如果存在）
```

Hash 只是验证方案，不能未经分析直接成为生产设计。

## 10. 实现阶段

### 阶段 A：凭证和 HTTP Client

复用登录 Spike 得出的 wire contract，但先复制最小实现，不急于抽公共 crate。

验收：

- 能读取凭证。
- 日志不包含 token。
- base URL 正确处理尾部 `/`。
- timeout 和 Ctrl+C 生效。

### 阶段 B：getUpdates

发送包含 `get_updates_buf` 和 `base_info` 的请求，解析：

- `ret`
- `errmsg`
- `msgs`
- `get_updates_buf`
- 服务端 timeout 字段

验收：

- 没有消息时可持续轮询。
- 收到消息后打印脱敏摘要。
- API ret 非零时不会误判为成功。

### 阶段 C：文本标准化

过滤：

- USER 消息。
- 非法 `from_user_id`。
- 没有 text item 的消息。
- 空文本。

保留：

- 原始 contextToken。
- 原始 raw JSON。
- 所有 text item 的确定性拼接顺序。

验收：

- 多 text item 拼接正确。
- 未知 item 类型不会导致整条消息失败。
- 非 USER 消息被安全忽略或记为 unsupported。

### 阶段 D：SQLite inbox

在同一事务中持久化 batch 与 sync buffer。

验收：

- persist 后崩溃，重启仍能处理 pending。
- 重复写入同一 batch 不产生重复 inbox 行。
- 数据库损坏或锁定返回明确错误。

### 阶段 E：sendMessage echo

构造：

- BOT message type。
- FINISH state。
- UUID client ID。
- text item。
- 原始 contextToken。
- 原始发送者作为 `to_user_id`。

验收：

- 微信能够收到 echo。
- 回复挂在正确消息上下文。
- 快速发送两条消息时回复不会交换 contextToken。
- 超过 4000 字时安全截断或按 Unicode code point 分块。

### 阶段 F：重试和退出

实现：

- 网络错误指数退避。
- HTTP 4xx/5xx 分类。
- API ret 非零处理。
- send 失败保留 inbox pending/failed。
- Ctrl+C 取消当前 long poll。
- 退出前关闭数据库。

在确认服务端是否按 client ID 幂等前，不允许无限自动重试发送。

## 11. 测试计划

单元测试：

- 文本提取。
- USER 类型过滤。
- Unicode 分块。
- contextToken 复制。
- 幂等键。
- API error 解析。

Mock HTTP 测试：

- 空 long poll。
- 单条消息。
- 同一用户两条不同 token。
- 多用户消息。
- 重复 batch。
- HTTP 500。
- API ret 非零。
- send 成功和失败。
- malformed JSON。
- abort。

SQLite 测试：

- batch 与 cursor 原子提交。
- 重启恢复 pending。
- 重复消息去重。
- 故障注入。

真实 E2E：

1. 启动 Spike。
2. 微信发送 `first`。
3. 立即发送 `second`。
4. 验证两条 echo 关联正确。
5. 启动 crash 注入。
6. 重启并验证 pending 消息恢复。

## 12. REPORT.md 内容

- getUpdates 实际字段。
- 是否存在稳定消息 ID。
- sync buffer 行为。
- 重复投递行为。
- contextToken 行为。
- sendMessage client ID 是否幂等。
- 崩溃恢复结果。
- 与 TypeScript transport 的 wire 差异。

## 13. Go/No-Go 标准

### Go

- 能持续接收真实微信文本消息。
- 能发送真实 echo。
- 两条快速消息不会串 contextToken。
- 重启后 sync buffer 有效。
- persist 后崩溃不会丢失本地待处理消息。
- token 不出现在日志和 fixture。
- long poll 可被 Ctrl+C 立即取消。

### No-Go

- Rust 请求无法满足服务端 wire contract。
- token 只对 Tencent TS 客户端的内部状态有效。
- contextToken 无法可靠关联。
- sync buffer 行为无法稳定复现。
- 服务端重复发送且无法构造可靠幂等键。
- sendMessage 需要无法稳定获得的隐式数据。

## 14. 预计工作量

AI 辅助下约 2–3 天。
