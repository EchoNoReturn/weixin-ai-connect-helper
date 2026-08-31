# spike-weixin-login-rust 实现计划

## 1. 目标

验证能否脱离 `@tencent-weixin/openclaw-weixin`，用 Rust 独立完成微信 iLink Bot 二维码登录。

需要回答：

1. 能否获得并展示二维码？
2. 能否轮询扫码状态？
3. 能否处理数字验证码？
4. 能否处理二维码过期和刷新？
5. 能否处理 IDC redirect？
6. 能否获得并持久化 `botToken`、`accountId`、`baseUrl`？
7. 生成的凭证能否被消息 Spike 使用？

## 2. 风险说明

这是三个 Spike 中风险最高的一个。Tencent 包当前还负责：

- iLink headers
- App ID
- ClientVersion 编码
- bot type
- QR 状态机
- redirect host
- verify code
- 本地 token list
- token/account 存储

本 Spike 只能根据公开接口、当前依赖行为和真实服务响应验证兼容性，不能假设 wire 细节长期稳定。

## 3. 非目标

- 多账号 UI
- 微信消息收发
- Agent
- daemon
- Web 登录页面
- 自动迁移现有正式凭证
- 图片和文件

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
base64 = "0.22"
rand = "0.9"
url = "2"
```

二维码终端渲染作为可选能力；第一版输出 URL 即可。

## 5. CLI 设计

```bash
cargo run -- \
  --state-dir ./tmp/state \
  --timeout 480 \
  --bot-type 3
```

支持：

```text
--state-dir <path>
--api-base-url <url>
--bot-type <value>
--timeout <seconds>
--no-qr-render
--verbose
```

App ID、ClientVersion 等协议参数应来自明确配置或构建常量。

## 6. 凭证格式与安全

Spike 不写入现有 `~/.wah`，使用独立格式：

```json
{
  "schemaVersion": 1,
  "accountId": "...",
  "token": "...",
  "baseUrl": "https://...",
  "userId": "...",
  "createdAt": "2026-08-30T00:00:00Z"
}
```

默认位置：

```text
./tmp/state/accounts/<normalized-account-id>.json
```

安全要求：

- Unix 文件权限 `0600`。
- 状态目录尽量使用 `0700`。
- 临时文件写入后原子 rename。
- 日志不输出完整 token、qrcode 或 userId。
- fixture 和 `REPORT.md` 只使用脱敏值。

## 7. 项目结构

```text
spike-weixin-login-rust/
├── Cargo.toml
├── Cargo.lock
├── README.md
├── REPORT.md
├── src/
│   ├── main.rs
│   ├── cli.rs
│   ├── http.rs
│   ├── headers.rs
│   ├── qr.rs
│   ├── login_state.rs
│   ├── credential_store.rs
│   ├── redact.rs
│   └── error.rs
├── tests/
└── fixtures/
```

登录状态必须建模成明确枚举：

```rust
enum LoginStatus {
    Waiting,
    Scanned,
    NeedVerifyCode,
    VerifyCodeBlocked,
    Expired,
    Redirect,
    AlreadyBound,
    Confirmed,
}
```

## 8. 实现阶段

### 阶段 A：HTTP 基线

实现：

- GET JSON。
- POST JSON。
- timeout 和取消。
- TLS。
- 公共 headers。
- HTTP 与 JSON 错误分类。
- 脱敏日志。

通过 mock server 验证 App ID、ClientVersion、`X-WECHAT-UIN`、Authorization 和 `base_info`。

### 阶段 B：获取二维码

调用二维码接口，解析：

- `qrcode`
- `qrcode_img_content`
- 错误码和错误信息

验收：

- 能输出可访问的二维码 URL。
- 获取失败时返回结构化错误。
- 日志不打印完整二维码凭据。

### 阶段 C：轮询状态

先实现最小状态流：

```text
Waiting → Scanned → Confirmed
```

加入总 timeout 和单请求 timeout。

验收：

- 扫码后显示状态变化。
- 确认后获得 token/account/baseUrl。
- Ctrl+C 可以立即取消 HTTP 请求。

### 阶段 D：完整状态机

支持：

- `need_verifycode`
- 用户输入验证码
- `verify_code_blocked`
- `expired`
- 最多三次二维码刷新
- `scaned_but_redirect`
- `binded_redirect`
- 未知状态

未知状态不得 panic，应返回明确错误或在有限次数内继续轮询。

### 阶段 E：凭证持久化

完成：

- account ID normalization。
- 目录创建。
- 原子写入。
- 文件权限。
- 写入后读取验证。
- 已存在凭证时不默认覆盖。

只输出凭证文件路径，不输出 token。

## 9. 测试计划

单元测试：

- ClientVersion 编码。
- UIN header。
- account ID normalization。
- 脱敏。
- 登录状态解析。
- credential round trip。

Mock HTTP 状态机：

```text
waiting → scanned → confirmed
waiting → need_verifycode → scanned → confirmed
waiting → expired → refresh → confirmed
scanned → redirect → confirmed
verify blocked → refresh limit
timeout
malformed JSON
HTTP 500
```

真实 E2E 必须人工显式启动，不进入普通 CI。

## 10. Fixtures

```text
fixtures/
├── get-bot-qrcode.request.json
├── get-bot-qrcode.response.json
├── qr-status.wait.json
├── qr-status.scanned.json
├── qr-status.confirmed.redacted.json
└── qr-status.redirect.json
```

所有 fixture 必须脱敏。

## 11. REPORT.md 内容

- 请求头要求。
- 实际状态序列。
- redirect 行为。
- 验证码行为。
- 与 Tencent TS 包的差异。
- 仍依赖隐式常量的部分。
- 是否适合独立维护。

## 12. Go/No-Go 标准

### Go

- 新账号能完成真实扫码登录。
- 获得的 token 可被消息 Spike 使用。
- 过期和 redirect 至少通过 mock 测试。
- 凭证不出现在普通日志。
- 重试和 Ctrl+C 不会留下损坏状态文件。

### No-Go

- 必须依赖 Tencent 包内部运行时状态。
- 必需 header 无法可靠获得。
- 服务端频繁改变未公开行为。
- token 只能由原 TS 包正确解释或持久化。
- Rust 获得 token，但消息 API 不接受。

## 13. 预计工作量

AI 辅助下约 2–4 天；真实扫码验证可能受外部状态影响。
