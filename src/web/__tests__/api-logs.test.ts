import { describe, it, expect, afterEach } from "bun:test";
import { createApiServer, type ApiDeps } from "../api-server.ts";
import { createLogger, type LogEntry } from "@yoyojcoder-weixin-ai/core";
import type { BridgeConfig } from "@yoyojcoder-weixin-ai/core";

const config: BridgeConfig = {
  allowFrom: [],
  defaultAgent: "opencode",
  agents: {},
  autoApprove: true,
  webPort: 3210,
  pluginsFile: "plugins.json",
  streamFlushMinChars: 200,
  streamFlushIdleMs: 3000,
};

const deps: ApiDeps = {
  getStatus: () => ({ health: null, version: "t" }),
  getConfig: () => config,
  saveConfig: async (n) => n,
};

interface WsMsg {
  type: "replay" | "log";
  entry: LogEntry;
}

function connectWs(port: number): Promise<{ ws: WebSocket; messages: WsMsg[]; opened: Promise<void> }> {
  const messages: WsMsg[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/logs`);
  const opened = new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(e);
  });
  ws.onmessage = (ev) => messages.push(JSON.parse(String(ev.data)));
  return Promise.resolve({ ws, messages, opened });
}

describe("WS /api/logs", () => {
  let server: ReturnType<typeof createApiServer>;

  afterEach(() => server?.stop(true));

  it("连接后先回放缓存日志，再接收实时日志", async () => {
    // 先产生一条历史日志（进入 ring buffer）
    createLogger("ws-test").info("历史日志-before-connect");

    server = createApiServer({ port: 0, deps });
    const { ws, messages, opened } = await connectWs(server.port!);
    await opened;

    // 等回放到达
    await Bun.sleep(100);
    const replays = messages.filter((m) => m.type === "replay");
    expect(replays.length).toBeGreaterThan(0);
    expect(replays.some((m) => m.entry.msg === "历史日志-before-connect")).toBe(true);

    // 实时日志
    const before = messages.length;
    createLogger("ws-test").warn("实时日志-after-connect");
    await Bun.sleep(100);
    const live = messages.slice(before).filter((m) => m.type === "log");
    expect(live.length).toBeGreaterThan(0);
    expect(live.some((m) => m.entry.msg === "实时日志-after-connect")).toBe(true);
    expect(live[0]!.entry.scope).toBe("ws-test");
    expect(live[0]!.entry.level).toBe("warn");

    ws.close();
    await Bun.sleep(50);
  });

  it("断开连接后不再推送（不泄漏）", async () => {
    server = createApiServer({ port: 0, deps });
    const { ws, messages, opened } = await connectWs(server.port!);
    await opened;
    await Bun.sleep(50);
    ws.close();
    await Bun.sleep(100);

    const count = messages.length;
    createLogger("ws-test").info("after-close-should-not-arrive");
    await Bun.sleep(100);
    expect(messages.length).toBe(count);
  });

  it("非 WS 请求 /api/logs 返回 400", async () => {
    server = createApiServer({ port: 0, deps });
    const res = await fetch(`http://127.0.0.1:${server.port!}/api/logs`);
    expect(res.status).toBe(400);
  });
});
