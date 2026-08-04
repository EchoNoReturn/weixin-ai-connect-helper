# weixin-ai-connect-helper 设计文档 v2

> 在微信里直接使用本机的 AI Coding Agent（opencode / Claude Code / Codex）。
> 本文档记录完整架构、插件系统、Web 控制台与迁移方案。

## 1. 目标

把微信变成 AI Coding Agent 的"远程终端"，以**消息生命周期管道**为核心架构：

```
微信消息 → [1] 接收 → [2] 路由 → [3] 上下文 → [4] 执行 → [5] 发送 → 微信回复
```

每个阶段有明确的输入/输出类型，插件 hook 挂在阶段之间。附带 Web 控制台：配置管理、Agent 安装、实时日志。

## 2. 消息生命周期管道

消息在管道中流动，每个阶段将上一阶段的输出作为输入，产生新的输出：

```
[RawMessage] → Stage 1 → [ParsedMessage] → Stage 2 → [RoutedMessage]
  → Stage 3 → [PromptContext] → Stage 4 → [AgentResult]
  → Stage 5 → [OutboundText] → 发送
```

### Stage 1：接收（Receive）

**输入：** 原始微信消息（ilink 协议格式）
**输出：** `ParsedMessage`

```
ilink getUpdates → 过滤 → 标准化 → hook: onReceive
```

- 微信长轮询收消息，过滤非 USER 类型和无效消息
- 提取 `fromUserId`、`text`、`contextToken` 等字段
- hook 可修改/过滤消息（如敏感词拦截、消息预处理）

```ts
interface ParsedMessage {
  fromUserId: string;     // xxx@im.wechat
  text: string;
  contextToken?: string;
  receivedAt: number;
}
```

### Stage 2：路由（Route）

**输入：** `ParsedMessage`
**输出：** `RoutedMessage`

```
解析前缀(/oc /cc /cx) → 选择 agent → 查找/创建 session → hook: onRoute
```

- 前缀解析确定 agentId，无前缀走用户绑定的默认 agent
- `(userId, agentId) → session` 映射，同一用户对同一 agent 是连续对话
- hook 可重写路由（如负载均衡、限流）

```ts
interface RoutedMessage {
  message: ParsedMessage;
  agentId: string;
  sessionId: string;      // 本桥接的 session ID
  acpSessionId?: string;  // ACP 侧的 session ID（首次 prompt 后填充）
}
```

### Stage 3：上下文（Context）

**输入：** `RoutedMessage`
**输出：** `PromptContext`

```
加载历史消息 → 拼接系统提示词 → hook: beforePrompt
```

- 从 SQLite 加载该 session 的历史消息
- 拼接系统提示词（由 `system-prompt` 插件注入）
- hook 可修改 context（如注入额外指令、截断历史）

```ts
interface PromptContext {
  routed: RoutedMessage;
  systemPrompt: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  prompt: string;          // 本轮用户输入
}
```

### Stage 4：执行（Execute）

**输入：** `PromptContext`
**输出：** `AgentResult`

```
ACP session/new → prompt → 流式接收 chunks → 合并 → hook: onPrompt
```

- 向 ACP agent 发送 prompt，流式接收 `agent_message_chunk`
- 流式合并策略：缓冲 ≥200 字符且距上次发送 ≥3s 时冲刷
- 权限审批：`request_permission` 回调（`auto-approve` 插件处理）
- session 结束时触发 `onSessionEnd`（`session-notify` 插件处理）

```ts
interface AgentResult {
  ctx: PromptContext;
  text: string;            // agent 完整回复文本
  stopReason: string;      // "completed" | "error" | "aborted"
  durationMs: number;
}
```

**生命周期事件（非消息流，但属于执行阶段）：**

| 事件 | 触发时机 | hook |
|---|---|---|
| agent 进程就绪 | ACP initialize 完成 | `onAgentReady` |
| agent 进程退出 | 子进程 exit | `onAgentExit` |
| session 结束 | prompt 完成/中断 | `onSessionEnd` |

### Stage 5：发送（Send）

**输入：** `AgentResult`
**输出：** 发送到微信

```
格式化回复 → 分块(4000char) → hook: beforeSend → sendMessage
```

- 流式合并剩余文本，格式化最终回复
- 超 4000 字符自动分块
- 携带 `contextToken`（微信会话上下文关联）
- hook 可修改输出（如添加后缀、格式转换）

### 完整数据流

```
WeChat msg
  │
  ▼
[Stage 1: Receive]  getUpdates → ParsedMessage  ── onReceive hook
  │
  ▼
[Stage 2: Route]    前缀解析 → RoutedMessage     ── onRoute hook
  │
  ▼
[Stage 3: Context]  历史+提示词 → PromptContext   ── beforePrompt hook
  │
  ▼
[Stage 4: Execute]  ACP prompt → AgentResult     ── onPrompt hook
  │                                                    onSessionEnd hook
  ▼
[Stage 5: Send]     格式化+分块 → sendToWeChat    ── beforeSend hook
```

## 3. 插件系统

### 3.1 设计原则

- Vite 风格：插件是带 hook 的函数，按注册顺序串行执行
- 第一版只支持内置插件（`src/plugins/`），后续版本开放外部插件
- 配置热更新（JSON/JSONC 读取），代码变更需重启

### 3.2 Plugin 接口

```ts
interface BridgePlugin {
  name: string;
  version?: string;

  // Stage 1: 接收
  onReceive?: (msg: ParsedMessage, next: () => Promise<void>) => Promise<ParsedMessage>;

  // Stage 2: 路由
  onRoute?: (msg: RoutedMessage, next: () => Promise<void>) => Promise<RoutedMessage>;

  // Stage 3: 上下文
  beforePrompt?: (ctx: PromptContext, next: () => Promise<void>) => Promise<PromptContext>;

  // Stage 4: 执行
  onPrompt?: (result: AgentResult, next: () => Promise<void>) => Promise<AgentResult>;
  onSessionEnd?: (ctx: SessionEndContext) => Promise<void>;

  // Stage 5: 发送
  beforeSend?: (text: string, next: () => Promise<void>) => Promise<string>;

  // 生命周期事件（非消息流）
  onAgentReady?: (agentId: string) => Promise<void>;
  onAgentExit?: (agentId: string, code: number | null) => Promise<void>;
}

interface SessionEndContext {
  agentId: string;
  sessionId: string;
  ownedByBridge: boolean;
  lastMessage?: string;
  durationMs: number;
  stopReason: string;
  notify: (text: string) => Promise<void>;
}
```

### 3.3 Hook 执行模型

插件从 `plugins.json` 按 hook 分组加载，每组是有序数组，按数组顺序串行执行：

```ts
// 插件系统：按 hook 名分组加载
type PluginEntry = { name: string; handler: Function };
type PluginRegistry = {
  onReceive:    PluginEntry[];
  onRoute:      PluginEntry[];
  beforePrompt: PluginEntry[];
  onPrompt:     PluginEntry[];
  onSessionEnd: PluginEntry[];
  beforeSend:   PluginEntry[];
};

// 从 plugins.json 加载
async function loadPlugins(file: string): Promise<PluginRegistry> {
  const raw = JSON.parse(Bun.file(file).text());
  const load = async (entries: any[]) => {
    const result: PluginEntry[] = [];
    for (const p of entries) {
      if (!p.enabled) continue;
      const mod = await import(p.entry);
      result.push({ name: p.name, handler: mod.default });
    }
    return result;
  };
  return {
    onReceive:    await load(raw.onReceive ?? []),
    onRoute:      await load(raw.onRoute ?? []),
    beforePrompt: await load(raw.beforePrompt ?? []),
    onPrompt:     await load(raw.onPrompt ?? []),
    onSessionEnd: await load(raw.onSessionEnd ?? []),
    beforeSend:   await load(raw.beforeSend ?? []),
  };
}

// 管道中每个阶段的执行方式
async function runStage<I, O>(
  stageName: string,
  hooks: Array<{ name: string; handler: (data: I, next: () => Promise<void>) => Promise<I> }>,
  initial: I,
  core: (data: I) => Promise<O>,
): Promise<O> {
  let idx = 0;
  const next = async (): Promise<void> => {
    if (idx < hooks.length) {
      const { name, handler } = hooks[idx++];
      const result = await handler(initial, next);
      Object.assign(initial, result);
      await next();
    }
  };
  await next();
  return core(initial);
}

// 管道编排
async function runPipeline(msg: RawMessage): Promise<void> {
  const parsed   = await runStage("receive",   registry.onReceive,   msg,    stage1Core);
  const routed   = await runStage("route",     registry.onRoute,     parsed, stage2Core);
  const ctx      = await runStage("context",   registry.beforePrompt,routed, stage3Core);
  const result   = await runStage("execute",   registry.onPrompt,    ctx,    stage4Core);
  await           runStage("send",      registry.beforeSend,   result, stage5Core);
}
```

### 3.4 内置插件（第一版）

| 插件 | Hook 阶段 | 功能 |
|---|---|---|
| `message-filter` | Stage 1 `onReceive` | 消息过滤/清洗 |
| `system-prompt` | Stage 3 `beforePrompt` | 注入系统提示词 |
| `stream-coalescer` | Stage 4 `onPrompt` | 流式合并策略 |
| `auto-approve` | Stage 4 `onPrompt` | 权限自动审批 |
| `session-notify` | Stage 4 `onSessionEnd` | 会话结束通知微信 |

#### session-notify 插件详细设计

监听 session 结束事件，根据 agent 配置的 `notifyPolicy` 决定是否发送微信通知：

| notifyPolicy | 行为 |
|---|---|
| `"none"` (默认) | 不通知 |
| `"own"` | 仅通知由本桥接程序创建的 session 结束 |
| `"all"` | 通知所有 session 结束 |

通知消息格式：

```
[会话结束] agent=opencode 时长=3m20s 结果=completed
最后回复：这是一个测试问题的回答...
```

配置位置：`bridge.config.json` 的 agent 配置中：

```jsonc
{
  "agents": {
    "opencode": {
      "command": "opencode",
      "args": ["acp"],
      "cwd": ".",
      "notifyPolicy": "own"   // "none" | "own" | "all"
    }
  }
}
```

实现要点：
- Stage 4 在 session prompt 结束时触发 `onSessionEnd` hook
- `session-notify` 插件在 hook 中根据 `notifyPolicy` 判断是否调用 `ctx.notify()`
- `notify()` 回调内部调用 Stage 5 的 `sendText()`
- `SessionManager` 记录每个 session 的 `ownedByBridge` 标记

### 3.5 插件配置

`plugins.json`（项目根目录）：按 hook 分组，每个插件只需指定入口脚本。

```jsonc
{
  "onReceive": [
    {
      "name": "message-filter",
      "enabled": true,
      "entry": "./plugins/message-filter.ts"
    }
  ],
  "onRoute": [],
  "beforePrompt": [
    {
      "name": "system-prompt",
      "enabled": true,
      "entry": "./plugins/system-prompt.ts"
    }
  ],
  "onPrompt": [
    {
      "name": "stream-coalescer",
      "enabled": true,
      "entry": "./plugins/stream-coalescer.ts"
    },
    {
      "name": "auto-approve",
      "enabled": true,
      "entry": "./plugins/auto-approve.ts"
    }
  ],
  "onSessionEnd": [
    {
      "name": "session-notify",
      "enabled": true,
      "entry": "./plugins/session-notify.ts"
    }
  ],
  "beforeSend": []
}
```

### 3.6 插件编写规范

插件是一个 TypeScript 文件，`export default` 导出对应 hook 类型的函数。插件自行决定所有内部逻辑和参数，框架不传任何外部配置。

```ts
// plugins/message-filter.ts
import type { ParsedMessage } from "@weixin-bridge/core";

const MAX_LENGTH = 5000;
const STRIP_EMOJI = false;

export default function onReceive(
  msg: ParsedMessage,
  next: () => Promise<void>,
): Promise<ParsedMessage> {
  if (msg.text.length > MAX_LENGTH) {
    msg.text = msg.text.slice(0, MAX_LENGTH);
  }
  return next();
}
```

```ts
// plugins/system-prompt.ts
import type { PromptContext } from "@weixin-bridge/core";

const SYSTEM_PROMPT = "你是一个 AI 助手，通过微信与用户交互。";

export default function beforePrompt(
  ctx: PromptContext,
  next: () => Promise<void>,
): Promise<PromptContext> {
  ctx.systemPrompt = SYSTEM_PROMPT;
  return next();
}
```

```ts
// plugins/session-notify.ts
import type { SessionEndContext } from "@weixin-bridge/core";

const MAX_LAST_MSG = 100;

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${s % 60}s` : `${s}s`;
}

export default async function onSessionEnd(ctx: SessionEndContext): Promise<void> {
  // 插件内部决定 notifyPolicy，从自身逻辑判断
  // 这里简化：始终通知（实际应读取 agent config）
  const last = ctx.lastMessage
    ? `\n最后回复：${ctx.lastMessage.slice(0, MAX_LAST_MSG)}`
    : "";
  await ctx.notify(
    `[会话结束] agent=${ctx.agentId} 时长=${formatDuration(ctx.durationMs)} 结果=${ctx.stopReason}${last}`,
  );
}
```

**框架加载插件的方式：**

```ts
async function loadPlugin(entry: string): Promise<Function> {
  const mod = await import(entry);
  return mod.default;  // 必须是 default export
}
```

**约定：**
- `export default` 导出一个函数，签名必须匹配对应 hook 的类型
- 插件自行管理所有配置（硬编码或读取环境变量），框架不传 config 参数
- 插件可 import `@weixin-bridge/core` 获取类型定义
- `onSessionEnd` 等生命周期 hook 没有 `next` 参数，直接执行即可

## 4. Web 控制台

### 4.1 技术栈

- 前端：React + Vite，打包为静态资源
- 后端：桥接进程内嵌 `Bun.serve()`，暴露 REST API + WebSocket
- 通信：REST（CRUD 操作） + WebSocket（实时日志流）

### 4.2 功能模块

| 页面 | 功能 |
|---|---|
| Dashboard | 连接状态、agent 状态概览 |
| Agents | Agent 安装/配置/启停 |
| Sessions | 会话列表、历史消息查看 |
| Plugins | 插件启用/禁用/配置 |
| Settings | bridge.config.json 可视化编辑 |
| Logs | 实时日志流（WebSocket） |

### 4.3 API 设计

```
GET    /api/status                    → 桥接状态
GET    /api/agents                    → agent 列表
POST   /api/agents                    → 添加 agent
PUT    /api/agents/:id                → 更新 agent 配置
DELETE /api/agents/:id                → 移除 agent

GET    /api/sessions                  → session 列表
GET    /api/sessions/:id/messages     → session 消息历史

GET    /api/plugins                   → 插件列表
PUT    /api/plugins/:name/toggle      → 启用/禁用
PUT    /api/plugins/:name/config      → 更新配置

GET    /api/config                    → 当前配置
PUT    /api/config                    → 更新配置

WS     /api/logs                      → 实时日志流
```

### 4.4 前端结构

```
packages/web/
├── index.html
├── vite.config.ts
├── package.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── api.ts              ← API 客户端
│   ├── hooks/
│   │   ├── useAgent.ts
│   │   ├── useSession.ts
│   │   ├── usePlugin.ts
│   │   └── useLogs.ts
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Agents.tsx
│   │   ├── Sessions.tsx
│   │   ├── Plugins.tsx
│   │   ├── Settings.tsx
│   │   └── Logs.tsx
│   └── components/
│       ├── Layout.tsx
│       ├── AgentCard.tsx
│       ├── SessionList.tsx
│       └── LogViewer.tsx
```

## 5. 数据持久化

### 5.1 SQLite（Session 持久化）

数据库文件：`~/.wah/bridge.db`

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  acp_session_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,          -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_messages_session ON messages(session_id, created_at);
CREATE INDEX idx_sessions_user_agent ON sessions(user_id, agent_id);
```

### 5.2 JSON/JSONC（插件配置）

`plugins.json` 见 §3.5。

### 5.3 bridge.config.json（桥接配置）

沿用现有格式，增加 `webPort` 字段：

```jsonc
{
  "allowFrom": [],
  "defaultAgent": "opencode",
  "agents": {
    "opencode": { "command": "opencode", "args": ["acp"], "cwd": "." }
  },
  "autoApprove": true,
  "webPort": 3210,              // Web 控制台端口
  "pluginsFile": "plugins.json" // 插件配置文件路径
}
```

## 6. Monorepo 结构

使用 Bun workspaces：

```
weixin-ai-connect-helper/
├── package.json                ← workspace root
├── DESIGN.md
├── AGENTS.md
├── bridge.config.json
├── plugins.json
│
├── packages/
│   ├── core/                   ← 管道引擎 + 插件系统 + 日志 + DB
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── pipeline.ts      ← 管道引擎：阶段注册、hook 执行链
│   │   │   ├── types.ts         ← ParsedMessage / RoutedMessage / PromptContext / AgentResult
│   │   │   ├── plugin-system.ts ← 插件加载、配置管理
│   │   │   ├── logger.ts        ← 统一日志（支持 WebSocket 推送）
│   │   │   └── db.ts            ← SQLite 初始化 + migrations
│   │   └── tsconfig.json
│   │
│   ├── transport/              ← Stage 1 & 5：微信收发
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── weixin/
│   │   │   │   ├── api.ts         ← openclaw-weixin 深导入封装
│   │   │   │   ├── login.ts       ← QR 扫码登录
│   │   │   │   ├── inbound.ts     ← getUpdates 长轮询（Stage 1）
│   │   │   │   └── outbound.ts    ← sendMessage + 分块（Stage 5）
│   │   │   └── types.ts
│   │   └── tsconfig.json
│   │
│   ├── orchestration/          ← Stage 2 & 3：路由 + 上下文
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── router.ts         ← 前缀路由 + agent 选择（Stage 2）
│   │   │   ├── context-builder.ts ← 历史 + 提示词拼接（Stage 3）
│   │   │   └── session-manager.ts ← SQLite session CRUD
│   │   └── tsconfig.json
│   │
│   ├── agent/                  ← Stage 4：ACP 执行
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── acp-client.ts     ← ACP 连接 + session 管理
│   │   │   ├── process-manager.ts ← 子进程 spawn/restart
│   │   │   ├── permission.ts     ← 权限审批处理
│   │   │   └── session-monitor.ts ← session 结束监听 + 通知触发
│   │   └── tsconfig.json
│   │
│   ├── plugins/                ← 内置插件
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts          ← 导出所有内置插件
│   │   │   ├── system-prompt.ts
│   │   │   ├── message-filter.ts
│   │   │   ├── stream-coalescer.ts
│   │   │   └── auto-approve.ts
│   │   └── tsconfig.json
│   │
│   └── web/                    ← Web 控制台
│       ├── package.json
│       ├── index.html
│       ├── vite.config.ts
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── api.ts
│       │   ├── hooks/
│       │   ├── pages/
│       │   └── components/
│       └── tsconfig.json
│
├── src/                        ← 主进程入口
│   ├── index.ts                ← bridge 启动入口
│   └── env.ts                  ← STATE_DIR 重定向
│
├── scripts/
│   └── test-acp.ts
│
└── types/
    └── openclaw-weixin.d.ts
```

### 6.1 依赖关系

```
core（管道引擎 + types）
  ├── transport    （Stage 1 & 5）
  ├── orchestration（Stage 2 & 3）
  └── agent        （Stage 4）

orchestration ← agent（session manager 被 Stage 4 使用）
所有 package ← plugins（插件依赖 core 的 hook 类型）
core ← web（API 路由需要 logger 和 config）
transport + orchestration + agent ← src/index.ts（主进程组装管道）
```

### 6.2 workspace 配置

根 `package.json`：

```json
{
  "name": "weixin-ai-connect-helper",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "start": "bun run src/index.ts",
    "dev": "bun run --watch src/index.ts",
    "dev:web": "bun run --filter @weixin-bridge/web dev",
    "build:web": "bun run --filter @weixin-bridge/web build",
    "test:acp": "bun run scripts/test-acp.ts",
    "typecheck": "bunx tsc --noEmit -p packages/core/tsconfig.json"
  },
  "dependencies": {
    "@agentclientprotocol/sdk": "^1.1.0",
    "@tencent-weixin/openclaw-weixin": "^2.4.6"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5"
  }
}
```

## 7. 配置

### 7.1 bridge.config.json

```jsonc
{
  "allowFrom": [],               // 微信用户ID白名单，空=自动绑定首个用户
  "defaultAgent": "opencode",
  "agents": {
    "opencode": {
      "command": "opencode",
      "args": ["acp"],
      "cwd": ".",
      "notifyPolicy": "none"    // "none" | "own" | "all"
    }
  },
  "autoApprove": true,
  "webPort": 3210,              // Web 控制台端口
  "pluginsFile": "plugins.json", // 插件配置文件路径
  "streamFlushMinChars": 200,
  "streamFlushIdleMs": 3000
}
```

### 7.2 plugins.json

见 §3.5。

## 8. 运行

```bash
bun install                        # 安装所有 workspace 依赖
bun run build:web                  # 构建 Web 控制台
bun run test:acp                   # ACP 冒烟测试
bun start                          # 启动桥 + Web 控制台
bun run dev                        # 开发模式（热重载主进程）
bun run dev:web                    # Web 控制台开发模式（Vite dev server）
```

## 9. 关键设计约束

### 9.1 import 顺序

`src/env.ts` 必须最先导入（设置 `OPENCLAW_STATE_DIR`），在主进程 `src/index.ts` 中保持。

### 9.2 深导入锁定

`@tencent-weixin/openclaw-weixin` 锁版本 `^2.4.6`，所有引用通过 `packages/transport/src/weixin/api.ts` 统一封装。

### 9.3 安全

- `allowFrom` 白名单是安全边界，agent 具有 shell 级别访问权限
- Web 控制台默认只监听 localhost（`127.0.0.1`）
- `autoApprove: true` 是 PoC 行为，生产环境应通过 Web 控制台关闭

### 9.4 contextToken

微信回复必须携带 `contextToken`（会话上下文关联），Stage 5（Send）自动管理。

## 10. 路线图

### Phase 1：基础重构（当前）
- [x] MVP 验证通过
- [x] Monorepo workspace 搭建
- [x] Core 包（管道引擎 + plugin system + logger + db）
- [x] Transport 包（Stage 1 & 5：从 src/weixin/ 迁移）
- [x] Orchestration 包（Stage 2 & 3：从 src/router.ts 迁移 + session manager）
- [x] Agent 包（Stage 4：从 src/acp/ 迁移）
- [x] 内置插件（message-filter, system-prompt, stream-coalescer, auto-approve, session-notify）

### Phase 2：Web 控制台
- [ ] Web 包搭建（React + Vite）
- [ ] API 路由（Bun.serve）
- [ ] Dashboard 页面
- [ ] Agent 管理页面
- [ ] 实时日志（WebSocket）
- [ ] 配置编辑页面

### Phase 3：增强
- [ ] Session 历史消息查看
- [ ] 插件管理页面
- [ ] Agent 安装向导
- [ ] 权限审批交互（替代 autoApprove）
- [ ] 图片/文件双向

### Phase 4：扩展
- [ ] 外部插件加载（plugins/ 目录动态 import）
- [ ] MCP 集成（agent 工具扩展）
- [ ] 对话监控/干预

## 11. 风险

| 风险 | 缓解 |
|---|---|
| 深导入 `dist/*` 非公开 API | 锁版本 2.4.6；api.ts 统一封装 |
| Monorepo 增加构建复杂度 | Bun workspace 原生支持，零配置 |
| Web 控制台增加依赖体积 | 仅构建产物静态资源，不影响主进程 |
| 插件 hook 性能开销 | 串行执行，单个 hook 预期 <1ms |
| SQLite 并发写入 | WAL 模式 + 单进程写入 |
