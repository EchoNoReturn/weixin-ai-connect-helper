# AGENTS.md — weixin-ai-connect-helper

## What this is

Multi-channel-to-AI-agent bridge with WeChat as the primary adapter and a local Webhook fallback. Reuses `@tencent-weixin/openclaw-weixin` only inside the WeChat transport and drives local agents via ACP. Architecture details: `DESIGN.md`.

## Commands

| Task | Command |
|---|---|
| Install | `bun install` |
| Smoke test (no WeChat login) | `bun run test:acp` |
| Start bridge (first run: QR scan) | `bun start` |
| Build CLI → `dist/` (wah + pgh) | `bun run build` (`build.ts [all\|version\|pgh\|cli]`) |
| Type check | `bun run typecheck` |
| Tests | `bun run test` |

Tests use `bun test`; CI runs type checks, TypeScript tests, Go test/vet, and the release build. No lint or formatter config exists yet.

## Critical: import order

`src/env.ts` **must be imported first** in `index.ts`. It sets `OPENCLAW_STATE_DIR` before any openclaw-weixin module loads. State directory defaults to `~/.wah`; override with `BRIDGE_STATE_DIR` env var.

## Dependencies & deep imports

- `@tencent-weixin/openclaw-weixin` is pinned to exact version `2.4.6`. All plugin imports are deep (`dist/src/*`), not through package exports.
- Type declarations for these deep imports live in `types/openclaw-weixin.d.ts` — update them when bumping the plugin version.
- `openclaw` peer dependency provides 3 utility functions (`normalizeAccountId`, etc.) at runtime; no OpenClaw host needed.

## Project structure

```
src/bridge.ts         ← channel adapters → pipeline → ACP → source channel
src/channels.ts       ← channel factory (WeChat / local Webhook)
src/env.ts            ← STATE_DIR redirect (import first!)
src/config.ts         ← bridge.config.json loader with defaults
packages/transport/  ← WeChat and Webhook ChannelAdapter implementations
packages/agent/      ← ACP client and subprocess lifecycle
packages/orchestration/ ← routing, access approval, context and sessions
scripts/build.ts      ← build entry: `bun run scripts/build.ts [all|version|pgh|cli]`
scripts/steps/        ← build steps (version / pgh Go build → dist / cli compile); shared helpers in scripts/lib/
scripts/test-acp.ts   ← ACP smoke test (no WeChat)
src/cli/runtime.ts    ← isDevMode (auto-detected via .ts entry; WAH_DEV=0/1 override) + resolveTool (env override → dev path → global PATH/extraDirs → execPath sibling → cwd, win32 .exe/PATHEXT aware)
src/cli/pgh.ts        ← findPgh()/isPghAvailable() built on resolveTool (override: WAH_PGH_PATH)
types/openclaw-weixin.d.ts ← ambient types for deep imports
bridge.config.json    ← optional config (gitignored)
```

## Config

`bridge.config.json` (all fields optional, defaults shown):

```jsonc
{
  "allowFrom": [],               // WeChat user IDs; empty = require local access approval
  "defaultAgent": "opencode",
  "agents": {
    "opencode": { "command": "opencode", "args": ["acp"], "cwd": "." }
  },
  "autoApprove": false,          // auto-approve agent permission requests
  "streamFlushMinChars": 200,
  "streamFlushIdleMs": 3000,
  "channels": [{ "type": "weixin", "id": "weixin-main" }]
}
```

## Key conventions

- **Bun runtime only.** No Node.js. Use `bun <file>`, `bun test`, `bun run <script>`.
- **ESM everywhere.** `"type": "module"` in package.json; tsconfig uses `"module": "Preserve"`.
- **TypeScript strict mode** with `verbatimModuleSyntax` — use `import type` for type-only imports.
- Message prefix routing: `/oc ` → opencode, `/cc ` → claude, `/cx ` → codex. No prefix = user's bound agent.
- `contextToken` must be forwarded on every reply (WeChat uses it for session correlation).
- Text messages chunked at 4000 chars before sending to WeChat.
- Stream coalescing: flush when buffer ≥200 chars AND idle ≥3s; always flush on prompt end.
- Agent stderr is inherited (visible in bridge terminal). stdout is ACP ndjson.
- Sessions are channel-scoped; the default WeChat adapter retains legacy IDs. Prompts per session are serialized via a queue.
- Log files live at `~/.wah/logs/YYYY-MM-DD.log` (daily rotation, dir follows `BRIDGE_STATE_DIR`); `wah status` prints the latest log path when one exists.

## Safety

- `allowFrom` whitelist is the security boundary — agent has shell-level access.
- When `allowFrom` is empty, unknown senders are recorded as pending and must be approved locally with `wah access approve <user-id>`.
- `autoApprove` defaults to `false`; enabling it means agent tool calls execute without confirmation.
