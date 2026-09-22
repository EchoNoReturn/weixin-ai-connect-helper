import path from "node:path";
import type { BridgeConfig } from "@yoyojcoder-weixin-ai/core";
import { validateBridgeConfig } from "../config-validation.ts";
import type { BridgeHealth } from "../bridge.ts";
import { readPluginsFile, writePluginsFile, listPlugins, setPluginEnabled } from "./plugins-file.ts";
import { onLogEntry, recentLogs } from "@yoyojcoder-weixin-ai/core";

/**
 * Web 控制台 API 服务（DESIGN §4.3）
 *
 * 桥进程内嵌 Bun.serve：
 *  - REST /api/*（本步骤实现 status + config，其余路由后续步骤追加）
 *  - 静态资源托管（app/web/dist，SPA fallback 到 index.html）
 *  - 仅监听 127.0.0.1
 *
 * 依赖全部注入，测试中可用内存实现替换。
 */

export interface StatusInfo {
  health: BridgeHealth | null;
  version: string;
}

export interface SessionListItem {
  id: string;
  userId: string;
  agentId: string;
  acpSessionId?: string;
  ownedByBridge: boolean;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface SessionMessageItem {
  id: number;
  role: string;
  content: string;
  createdAt: number;
}

export interface ApiDeps {
  getStatus: () => StatusInfo;
  getConfig: () => BridgeConfig;
  /** 持久化配置（写回 bridge.config.json）；返回更新后的生效配置 */
  saveConfig: (next: BridgeConfig) => Promise<BridgeConfig>;
  /** 会话查询（未注入时 /api/sessions 返回 501） */
  listSessions?: () => SessionListItem[];
  getSessionMessages?: (sessionId: string, limit: number) => SessionMessageItem[];
  /** plugins.json 路径（未注入时 /api/plugins 返回 501） */
  pluginsFile?: string;
}

export interface ApiServerOptions {
  port: number;
  deps: ApiDeps;
  /** 静态资源目录（构建产物）；不存在时 /api 仍可用，页面路径返回 503 */
  staticDir?: string;
  host?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function jsonError(status: number, message: string): Response {
  return json({ error: message }, status);
}

/** config 允许更新的字段白名单（PUT /api/config） */
const UPDATABLE_KEYS = [
  "allowFrom",
  "defaultAgent",
  "agents",
  "autoApprove",
  "webPort",
  "pluginsFile",
  "streamFlushMinChars",
  "streamFlushIdleMs",
] as const;

/** 校验合并后的完整配置（复用启动时的 validateBridgeConfig，与 /api/agents 校验强度对齐） */
function validateMergedConfig(next: unknown): string | null {
  try {
    validateBridgeConfig(next);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message.replace(/^\[config\]\s*/, "") : String(err);
  }
}

/**
 * 写操作的 CSRF 防护（api 只监听 localhost，但浏览器任意网页都能向 127.0.0.1 发请求）：
 *  - Origin 头存在时必须是本机来源（127.0.0.1 / localhost，任意端口，兼容 vite dev）
 *  - POST/PUT 要求 Content-Type: application/json —— 跨站 no-cors 请求无法携带该头
 *    （DELETE 无简单请求形态，跨站 fetch 必触发预检，无 CORS 头即被浏览器拦截）
 */
function checkWriteGuard(req: Request): Response | null {
  if (req.method === "GET" || req.method === "HEAD") return null;

  const origin = req.headers.get("origin");
  if (origin) {
    let hostname = "";
    try {
      hostname = new URL(origin).hostname;
    } catch {
      return jsonError(403, "非法 Origin");
    }
    if (hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "[::1]") {
      return jsonError(403, "跨站请求被拒绝");
    }
  }

  if (req.method === "POST" || req.method === "PUT") {
    const ct = req.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().includes("application/json")) {
      return jsonError(415, "Content-Type 必须是 application/json");
    }
  }
  return null;
}

/** 读取并校验 JSON 对象请求体；失败时直接返回 400 Response */
async function readJsonObject(req: Request): Promise<Record<string, unknown> | Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "请求体不是合法 JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return jsonError(400, "请求体必须是 JSON 对象");
  }
  return body as Record<string, unknown>;
}

function parseNotifyPolicy(v: unknown): "none" | "own" | "all" | undefined {
  if (v === undefined || v === null) return "none";
  if (v === "none" || v === "own" || v === "all") return v;
  return undefined;
}

async function handleApi(req: Request, pathname: string, deps: ApiDeps): Promise<Response> {
  // GET /api/status
  if (pathname === "/api/status" && req.method === "GET") {
    const { health, version } = deps.getStatus();
    return json({
      version,
      bridge: health ?? { status: "stopped" },
      now: Date.now(),
    });
  }

  // ── /api/agents ──

  // GET /api/agents — agent 列表（含 default 标记）
  if (pathname === "/api/agents" && req.method === "GET") {
    const cfg = deps.getConfig();
    const list = Object.entries(cfg.agents).map(([id, a]) => ({
      id,
      command: a.command,
      args: a.args,
      cwd: a.cwd,
      notifyPolicy: a.notifyPolicy ?? "none",
      isDefault: id === cfg.defaultAgent,
    }));
    return json({ defaultAgent: cfg.defaultAgent, agents: list });
  }

  // POST /api/agents — 新增 agent
  if (pathname === "/api/agents" && req.method === "POST") {
    const body = await readJsonObject(req);
    if (body instanceof Response) return body;

    const id = body.id;
    const command = body.command;
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      return jsonError(400, "id 必填且只能包含字母/数字/连字符/下划线");
    }
    if (typeof command !== "string" || !command.trim()) {
      return jsonError(400, "command 必填");
    }
    const cfg = deps.getConfig();
    if (id in cfg.agents) {
      return jsonError(409, `agent "${id}" 已存在`);
    }
    const next: BridgeConfig = {
      ...cfg,
      agents: {
        ...cfg.agents,
        [id]: {
          command: command.trim(),
          args: Array.isArray(body.args) ? body.args.map(String) : [],
          cwd: typeof body.cwd === "string" && body.cwd.trim() ? body.cwd : ".",
          notifyPolicy: parseNotifyPolicy(body.notifyPolicy),
        },
      },
    };
    const saved = await deps.saveConfig(next);
    return json({ id, config: saved.agents[id], restartRequired: true }, 201);
  }

  // PUT /api/agents/:id — 更新 agent 配置
  const agentMatch = pathname.match(/^\/api\/agents\/([a-zA-Z0-9_-]+)$/);
  if (agentMatch && req.method === "PUT") {
    const id = agentMatch[1]!;
    const cfg = deps.getConfig();
    const existing = cfg.agents[id];
    if (!existing) return jsonError(404, `agent "${id}" 不存在`);

    const body = await readJsonObject(req);
    if (body instanceof Response) return body;

    const updated = { ...existing };
    if ("command" in body) {
      if (typeof body.command !== "string" || !body.command.trim()) {
        return jsonError(400, "command 必须是非空字符串");
      }
      updated.command = body.command.trim();
    }
    if ("args" in body) {
      if (!Array.isArray(body.args)) return jsonError(400, "args 必须是数组");
      updated.args = body.args.map(String);
    }
    if ("cwd" in body) {
      if (typeof body.cwd !== "string" || !body.cwd.trim()) {
        return jsonError(400, "cwd 必须是非空字符串");
      }
      updated.cwd = body.cwd;
    }
    if ("notifyPolicy" in body) {
      const p = parseNotifyPolicy(body.notifyPolicy);
      if (p === undefined) return jsonError(400, 'notifyPolicy 必须是 "none" | "own" | "all"');
      updated.notifyPolicy = p;
    }
    const next: BridgeConfig = { ...cfg, agents: { ...cfg.agents, [id]: updated } };
    const saved = await deps.saveConfig(next);
    return json({ id, config: saved.agents[id], restartRequired: true });
  }

  // DELETE /api/agents/:id — 删除 agent
  if (agentMatch && req.method === "DELETE") {
    const id = agentMatch[1]!;
    const cfg = deps.getConfig();
    if (!(id in cfg.agents)) return jsonError(404, `agent "${id}" 不存在`);
    if (id === cfg.defaultAgent) {
      return jsonError(400, `不能删除默认 agent "${id}"，请先修改 defaultAgent`);
    }
    const agents = { ...cfg.agents };
    delete agents[id];
    await deps.saveConfig({ ...cfg, agents });
    return json({ deleted: id, restartRequired: true });
  }

  // ── /api/sessions ──

  // GET /api/sessions — 会话列表
  if (pathname === "/api/sessions" && req.method === "GET") {
    if (!deps.listSessions) return jsonError(501, "会话查询未启用");
    return json({ sessions: deps.listSessions() });
  }

  // GET /api/sessions/:id/messages?limit=N — 会话消息历史
  const msgMatch = pathname.match(/^\/api\/sessions\/(.+)\/messages$/);
  if (msgMatch && req.method === "GET") {
    if (!deps.getSessionMessages) return jsonError(501, "会话查询未启用");
    const sessionId = decodeURIComponent(msgMatch[1]!);
    const url = new URL(req.url);
    const rawLimit = Number(url.searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 500) : 100;
    return json({ sessionId, limit, messages: deps.getSessionMessages(sessionId, limit) });
  }

  // ── /api/plugins ──

  // GET /api/plugins — 插件列表
  if (pathname === "/api/plugins" && req.method === "GET") {
    if (!deps.pluginsFile) return jsonError(501, "插件管理未启用");
    const file = await readPluginsFile(deps.pluginsFile);
    return json({ plugins: listPlugins(file), restartRequired: true });
  }

  // PUT /api/plugins/:name/toggle — 启用/禁用
  const toggleMatch = pathname.match(/^\/api\/plugins\/([^/]+)\/toggle$/);
  if (toggleMatch && req.method === "PUT") {
    if (!deps.pluginsFile) return jsonError(501, "插件管理未启用");
    const name = decodeURIComponent(toggleMatch[1]!);
    const body = await readJsonObject(req);
    if (body instanceof Response) return body;
    if (typeof body.enabled !== "boolean") {
      return jsonError(400, "enabled 必须是布尔值");
    }
    const file = await readPluginsFile(deps.pluginsFile);
    if (!setPluginEnabled(file, name, body.enabled)) {
      return jsonError(404, `插件 "${name}" 不存在`);
    }
    await writePluginsFile(deps.pluginsFile, file);
    return json({ name, enabled: body.enabled, restartRequired: true });
  }

  // GET /api/config
  if (pathname === "/api/config" && req.method === "GET") {
    return json(deps.getConfig());
  }

  // PUT /api/config
  if (pathname === "/api/config" && req.method === "PUT") {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, "请求体不是合法 JSON");
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return jsonError(400, "请求体必须是 JSON 对象");
    }
    const current = deps.getConfig();
    const patch = body as Record<string, unknown>;
    const next: BridgeConfig = { ...current };
    for (const key of UPDATABLE_KEYS) {
      if (key in patch) {
        (next as unknown as Record<string, unknown>)[key] = patch[key];
      }
    }
    const invalid = validateMergedConfig(next);
    if (invalid) {
      return jsonError(400, `配置校验失败: ${invalid}`);
    }
    const saved = await deps.saveConfig(next);
    return json({ config: saved, restartRequired: true });
  }

  return jsonError(404, `未知 API: ${req.method} ${pathname}`);
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function serveStatic(pathname: string, staticDir: string): Promise<Response> {
  // 防目录穿越：必须严格位于 staticDir 之内
  // （裸 startsWith 会把 dist-backup 这类同名前缀兄弟目录误判为合法）
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  const root = path.resolve(staticDir);
  const resolved = path.resolve(root, rel);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return jsonError(403, "禁止访问");
  }

  // 实际服务的文件路径（用于确定 MIME）
  // 注意：Bun.file(目录).exists() 不可靠，目录需显式探测其下 index.html
  let servedPath = resolved;
  let file = Bun.file(servedPath);

  if (!(await file.exists())) {
    if (!path.extname(rel)) {
      // 无扩展名：先试 目录/index.html（如 /docs → docs/index.html）
      const dirIndex = Bun.file(path.join(resolved, "index.html"));
      if (await dirIndex.exists()) {
        servedPath = path.join(resolved, "index.html");
        file = dirIndex;
      } else {
        // SPA fallback 到根 index.html
        const rootIndexPath = path.join(staticDir, "index.html");
        const rootIndex = Bun.file(rootIndexPath);
        if (!(await rootIndex.exists())) {
          return jsonError(503, "Web 控制台未构建，请先运行 bun run build:web");
        }
        servedPath = rootIndexPath;
        file = rootIndex;
      }
    } else {
      return jsonError(404, "资源不存在");
    }
  }

  const ext = path.extname(servedPath).toLowerCase();
  return new Response(file, {
    headers: { "Content-Type": MIME[ext] ?? "application/octet-stream" },
  });
}

interface WsData {
  off: () => void;
}

export function createApiServer(opts: ApiServerOptions): Bun.Server<WsData> {
  const host = opts.host ?? "127.0.0.1";
  const server = Bun.serve<WsData>({
    port: opts.port,
    hostname: host,
    fetch: async (req, srv) => {
      const url = new URL(req.url);

      // WS /api/logs — 实时日志流（回放 + 推送）
      if (url.pathname === "/api/logs") {
        const upgraded = srv.upgrade(req, {
          data: { off: () => {} } as WsData,
        });
        if (upgraded) return undefined as unknown as Response;
        return jsonError(400, "需要 WebSocket 连接");
      }

      if (url.pathname.startsWith("/api/")) {
        const blocked = checkWriteGuard(req);
        if (blocked) return blocked;
        try {
          return await handleApi(req, url.pathname, opts.deps);
        } catch (err) {
          return jsonError(500, `内部错误: ${String(err)}`);
        }
      }
      if (opts.staticDir) {
        return serveStatic(url.pathname, opts.staticDir);
      }
      return jsonError(503, "Web 控制台未构建，请先运行 bun run build:web");
    },
    websocket: {
      open(ws) {
        // 回放最近日志
        for (const entry of recentLogs()) {
          ws.send(JSON.stringify({ type: "replay", entry }));
        }
        // 订阅实时推送
        ws.data.off = onLogEntry((entry) => {
          try {
            ws.send(JSON.stringify({ type: "log", entry }));
          } catch {
            // 连接已断开，等待 close 清理
          }
        });
      },
      message() {
        // 只推送，不接收客户端消息
      },
      close(ws) {
        ws.data.off();
      },
    },
  });
  return server;
}
