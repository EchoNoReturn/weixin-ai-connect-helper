import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createApiServer, type ApiDeps, type SessionListItem, type SessionMessageItem } from "../api-server.ts";
import type { BridgeConfig } from "@yoyojcoder-weixin-ai/core";

const config: BridgeConfig = {
  allowFrom: [],
  defaultAgent: "opencode",
  agents: { opencode: { command: "opencode", args: ["acp"], cwd: "." } },
  autoApprove: true,
  webPort: 3210,
  pluginsFile: "plugins.json",
  streamFlushMinChars: 200,
  streamFlushIdleMs: 3000,
  channels: [{ type: "weixin", id: "weixin-main", enabled: true }],
};

const sessions: SessionListItem[] = [
  {
    id: "u1@im.wechat:opencode",
    userId: "u1@im.wechat",
    agentId: "opencode",
    ownedByBridge: true,
    createdAt: 1000,
    updatedAt: 2000,
    messageCount: 4,
  },
];

const messages: SessionMessageItem[] = [
  { id: 1, role: "user", content: "你好", createdAt: 1500 },
  { id: 2, role: "assistant", content: "你好！有什么可以帮你？", createdAt: 1800 },
];

function makeDeps(overrides: Partial<ApiDeps> = {}): ApiDeps {
  return {
    getStatus: () => ({ health: null, version: "t" }),
    getConfig: () => config,
    saveConfig: async (n) => n,
    listSessions: () => sessions,
    getSessionMessages: (_id, limit) => messages.slice(0, limit),
    ...overrides,
  };
}

describe("api-server /api/sessions", () => {
  let server: ReturnType<typeof createApiServer>;
  let base: string;

  function start(deps: ApiDeps) {
    server = createApiServer({ port: 0, deps });
    base = `http://127.0.0.1:${server.port!}`;
  }

  afterEach(() => server.stop(true));

  it("GET /api/sessions 返回会话列表", async () => {
    start(makeDeps());
    const res = await fetch(`${base}/api/sessions`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].id).toBe("u1@im.wechat:opencode");
    expect(body.sessions[0].messageCount).toBe(4);
  });

  it("GET /api/sessions/:id/messages 返回消息历史（含特殊字符的 id 需 URL 编码）", async () => {
    start(makeDeps());
    const id = encodeURIComponent("u1@im.wechat:opencode");
    const res = await fetch(`${base}/api/sessions/${id}/messages`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.sessionId).toBe("u1@im.wechat:opencode");
    expect(body.limit).toBe(100);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("user");
  });

  it("limit 参数生效", async () => {
    start(makeDeps());
    const id = encodeURIComponent("u1@im.wechat:opencode");
    const res = await fetch(`${base}/api/sessions/${id}/messages?limit=1`);
    const body = await res.json() as any;
    expect(body.limit).toBe(1);
    expect(body.messages).toHaveLength(1);
  });

  it("limit 超上限被钳制到 500", async () => {
    start(makeDeps());
    const id = encodeURIComponent("u1@im.wechat:opencode");
    const res = await fetch(`${base}/api/sessions/${id}/messages?limit=99999`);
    const body = await res.json() as any;
    expect(body.limit).toBe(500);
  });

  it("非法 limit 回退默认值 100", async () => {
    start(makeDeps());
    const id = encodeURIComponent("u1@im.wechat:opencode");
    const res = await fetch(`${base}/api/sessions/${id}/messages?limit=abc`);
    const body = await res.json() as any;
    expect(body.limit).toBe(100);
  });

  it("未注入会话查询时返回 501", async () => {
    start(makeDeps({ listSessions: undefined, getSessionMessages: undefined }));
    const res1 = await fetch(`${base}/api/sessions`);
    expect(res1.status).toBe(501);
    const id = encodeURIComponent("x:y");
    const res2 = await fetch(`${base}/api/sessions/${id}/messages`);
    expect(res2.status).toBe(501);
  });
});
