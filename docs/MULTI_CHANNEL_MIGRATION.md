# 多渠道迁移指南

## 兼容行为

- 未配置 `channels` 的旧配置会自动使用 `weixin-main`，无需修改。
- `weixin-main` 继续使用原有 `<微信用户>:<agent>` Session ID 和原有审批用户 ID，历史会话与审批保持可用。
- 新渠道的审批键为 `<channel-id>:<sender-id>`，Session ID 带渠道与会话命名空间。
- `autoApprove` 默认关闭；空 `allowFrom` 需要运行 `wah access approve <审批键>`。

## 同时启用微信与本地 Webhook

```jsonc
{
  "channels": [
    { "type": "weixin", "id": "weixin-main" },
    { "type": "webhook", "id": "webhook-local", "hostname": "127.0.0.1", "port": 3211 }
  ]
}
```

首次请求会登记待审批用户：

```bash
curl -i -X POST http://127.0.0.1:3211/v1/messages \
  -H 'content-type: application/json' \
  -d '{"senderId":"local-user","text":"hello"}'
wah access approve webhook-local:local-user
```

## 仅使用备用渠道

从 `channels` 删除微信项即可。此时启动过程不会加载微信登录或 `openclaw-weixin` 的运行路径。

监听非回环地址时必须配置 `tokenEnv`，例如 `"tokenEnv":"WAH_WEBHOOK_TOKEN"`，请求需携带 `Authorization: Bearer <token>`。
