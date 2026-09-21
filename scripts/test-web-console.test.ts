import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * 集成测试：Web 控制台后端全链路
 * createApiServer + 真实 SessionManager(SQLite) + 真实配置文件持久化 + 插件文件 + WS 日志
 * 验证各模块联合后的完整功能（区别于单测的内存 mock deps）
 */

const tmpState = mkdtempSync(path.join(tmpdir(), "wah-webit-"));
process.env.BRIDGE_STATE_DIR = tmpState;

const { createApiServer } = await import("../src/web/api-server.ts");
const { SessionManager } = await import("@yoyojcoder-weixin-ai/orchestration");
const { createLogger, closeDb } = await import("@yoyojcoder-weixin-ai/core");
import type { BridgeConfig } from "@yoyojcoder-weixin-ai/core";

let server: ReturnType<typeof createApiServer>;
let base: string;
let configFile: string;
let pluginsFile: string;
let staticDir: string;

const initialConfig: BridgeConfig = {
  allowFrom: ["u1@im.wechat"],
  defaultAgent: "opencode",
  agents: {
    opencode: { command: "opencode", args: ["acp"], cwd: ".", notifyPolicy: "none" },
  },
  autoApprove: true,
  webPort: 3210,
  pluginsFile: "plugins.json",
  streamFlushMinChars: 200,
  streamFlushIdleMs: 3000,
};

beforeAll(async () => {
  // 真实配置文件
  configFile = path.join(tmpState, "bridge.config.json");
  writeFileSync(configFile, JSON.stringify(initialConfig, null, 2));
  pluginsFile = path.join(tmpState, "plugins.json");
  writeFileSync(pluginsFile, JSON.stringify({
    onReceive: [{ name: "message-filter", enabled: true, entry: "./plugins/message-filter.ts" }],
    onSessionEnd: [{ name: "session-notify", enabled: false, entry: "./plugins/session-notify.ts" }],
  }));

  // 静态资源
  staticDir = path.join(tmpState, "dist");
  mkdirSync(staticDir);
  writeFileSync(path.join(staticDir, "index.html"), "<html>wah console</html>");

  // 真实 SessionManager + 造数
  const sessionMgr = new SessionManager();
  sessionMgr.getOrCreate("u1@im.wechat", "opencode");
  sessionMgr.saveMessage("u1@im.wechat:opencode", "user", "集成测试问题");
  sessionMgr.saveMessage("u1@im.wechat:opencode", "assistant", "集成测试回答");

  let current = initialConfig;
  server = createApiServer({
    port: 0,
    staticDir,
    deps: {
      getStatus: () => ({
        health: { status: "connected", accountId: "it-acc", reconnectAttempts: 0, startedAt: Date.now() },
        version: "it-1.0",
      }),
      getConfig: () => current,
      saveConfig: async (next) => {
        writeFileSync(configFile, JSON.stringify(next, null, 2));
        current = next;
        return next;
      },
      listSessions: () => sessionMgr.list(),
      getSessionMessages: (id, limit) => sessionMgr.getMessages(id, limit),
      pluginsFile,
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});

afterAll(async () => {
  server.stop(true);
  closeDb();
  await Bun.sleep(100);
  try { rmSync(tmpState, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
});

describe("Web 控制台后端集成", () => {
  it("场景1：Dashboard 数据链 — status + sessions + messages", async () => {
    const status = await (await fetch(`${base}/api/status`)).json() as any;
    expect(status.bridge.status).toBe("connected");
    expect(status.version).toBe("it-1.0");

    const sessions = await (await fetch(`${base}/api/sessions`)).json() as any;
    const s = sessions.sessions.find((x: any) => x.userId === "u1@im.wechat");
    expect(s).toBeDefined();
    expect(s.messageCount).toBe(2);

    const msgs = await (await fetch(
      `${base}/api/sessions/${encodeURIComponent(s.id)}/messages`,
    )).json() as any;
    expect(msgs.messages.map((m: any) => m.content)).toEqual(["集成测试问题", "集成测试回答"]);
  });

  it("场景2：配置修改链 — PUT config → 落盘 → agents CRUD 读取新值", async () => {
    // 通过 API 加 agent
    const res = await fetch(`${base}/api/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "codex", command: "codex", args: ["acp"] }),
    });
    expect(res.status).toBe(201);

    // 修改 defaultAgent
    const res2 = await fetch(`${base}/api/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultAgent: "codex" }),
    });
    expect(res2.status).toBe(200);

    // 配置文件已落盘且两处修改都在
    const onDisk = JSON.parse(readFileSync(configFile, "utf8"));
    expect(onDisk.defaultAgent).toBe("codex");
    expect(onDisk.agents.codex.command).toBe("codex");

    // GET /api/agents 反映新默认
    const agents = await (await fetch(`${base}/api/agents`)).json() as any;
    expect(agents.defaultAgent).toBe("codex");
    expect(agents.agents.find((a: any) => a.id === "codex").isDefault).toBe(true);
  });

  it("场景3：插件管理链 — toggle → plugins.json 落盘 → 列表反映", async () => {
    const res = await fetch(`${base}/api/plugins/session-notify/toggle`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(200);

    const onDisk = JSON.parse(readFileSync(pluginsFile, "utf8"));
    expect(onDisk.onSessionEnd[0].enabled).toBe(true);

    const list = await (await fetch(`${base}/api/plugins`)).json() as any;
    expect(list.plugins.find((p: any) => p.name === "session-notify").enabled).toBe(true);
  });

  it("场景4：实时日志链 — logger 写入 → WS 客户端收到", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/api/logs`);
    const received: any[] = [];
    ws.onmessage = (ev) => received.push(JSON.parse(String(ev.data)));
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = reject;
    });

    createLogger("web-it").info("集成测试日志-unique-marker");
    await Bun.sleep(150);

    expect(received.some((m) => m.type === "log" && m.entry.msg === "集成测试日志-unique-marker")).toBe(true);
    ws.close();
  });

  it("场景5：前端托管 — 静态页面 + SPA fallback", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("wah console");

    const spa = await fetch(`${base}/sessions`);
    expect(spa.status).toBe(200);
  });
});
