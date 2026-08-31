# 发布验收清单

- `bun install --frozen-lockfile`
- `bun run typecheck`
- `bun test packages/ scripts/ src/__tests__/`
- `cd tool/pgh && go test ./... && go vet ./...`
- `bun run build`
- `bash -n install.sh uninstall.sh`
- 微信扫码/复用登录、入站、分块回复和 `contextToken` 回归
- Webhook-only 启动不触发微信登录；待审批、批准、回复链路回归
- 同时启用两个渠道时，用户授权、Agent 绑定和 Session 不串线
- `wah status` 展示每个渠道状态；`wah channels` 与配置一致
- 升级保留 `~/.wah`；卸载不删除凭证、配置、数据库和日志
- 非回环 Webhook 在缺少 token 时必须拒绝启动
