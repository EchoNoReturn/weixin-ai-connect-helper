import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createApiServer, type ApiDeps } from "../api-server.ts";
import type { BridgeConfig } from "@yoyojcoder-weixin-ai/core";

function baseConfig(): BridgeConfig {
  return {
    allowFrom: [],
    defaultAgent: "opencode",
    agents: {
      opencode: { command: "opencode", args: ["acp"], cwd: ".", notifyPolicy: "none" },
      claude: { command: "claude", args: ["--acp"], cwd: "/tmp", notifyPolicy: "own" },
    },
    autoApprove: true,
    webPort: 3210,
    pluginsFile: "plugins.json",
    streamFlushMinChars: 200,
    streamFlushIdleMs: 3000,
    channels: [{ type: "weixin", id: "weixin-main", enabled: true }],
  };
}

describe("api-server /api/agents", () => {
  let server: ReturnType<typeof createApiServer>;
  let base: string;
  let config: BridgeConfig;

  beforeEach(() => {
    config = baseConfig();
    const deps: ApiDeps = {
      getStatus: () => ({ health: null, version: "t" }),
      getConfig: () => config,
      saveConfig: async (next) => { config = next; return next; },
    };
    server = createApiServer({ port: 0, deps });
    base = `http://127.0.0.1:${server.port!}`;
  });

  afterEach(() => server.stop(true));

  it("GET /api/agents 返回列表含 default 标记", async () => {
    const res = await fetch(`${base}/api/agents`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.defaultAgent).toBe("opencode");
    expect(body.agents).toHaveLength(2);
    const oc = body.agents.find((a: any) => a.id === "opencode");
    expect(oc.isDefault).toBe(true);
    const cc = body.agents.find((a: any) => a.id === "claude");
    expect(cc.isDefault).toBe(false);
    expect(cc.notifyPolicy).toBe("own");
  });

  it("POST /api/agents 新增成功返回 201", async () => {
    const res = await fetch(`${base}/api/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "codex", command: "codex", args: ["acp"], cwd: "/work", notifyPolicy: "all" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.id).toBe("codex");
    expect(body.config.notifyPolicy).toBe("all");
    expect(config.agents.codex?.command).toBe("codex");
    expect(config.agents.codex?.args).toEqual(["acp"]);
  });

  it("POST /api/agents 缺省字段有默认值", async () => {
    const res = await fetch(`${base}/api/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "mini", command: "mini" }),
    });
    expect(res.status).toBe(201);
    expect(config.agents.mini?.args).toEqual([]);
    expect(config.agents.mini?.cwd).toBe(".");
    expect(config.agents.mini?.notifyPolicy).toBe("none");
  });

  it("POST 重复 id 返回 409", async () => {
    const res = await fetch(`${base}/api/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "opencode", command: "x" }),
    });
    expect(res.status).toBe(409);
  });

  it("POST 非法 id 返回 400", async () => {
    for (const id of ["", "has space", "中文", "a/b"]) {
      const res = await fetch(`${base}/api/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, command: "x" }),
      });
      expect(res.status).toBe(400);
    }
  });

  it("POST 缺 command 返回 400", async () => {
    const res = await fetch(`${base}/api/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("PUT /api/agents/:id 更新字段", async () => {
    const res = await fetch(`${base}/api/agents/claude`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd: "/new", notifyPolicy: "all", args: ["--acp", "--verbose"] }),
    });
    expect(res.status).toBe(200);
    expect(config.agents.claude?.cwd).toBe("/new");
    expect(config.agents.claude?.notifyPolicy).toBe("all");
    expect(config.agents.claude?.args).toEqual(["--acp", "--verbose"]);
    // 未更新字段不变
    expect(config.agents.claude?.command).toBe("claude");
  });

  it("PUT 不存在的 agent 返回 404", async () => {
    const res = await fetch(`${base}/api/agents/ghost`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd: "/x" }),
    });
    expect(res.status).toBe(404);
  });

  it("PUT 非法 notifyPolicy 返回 400", async () => {
    const res = await fetch(`${base}/api/agents/claude`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifyPolicy: "sometimes" }),
    });
    expect(res.status).toBe(400);
  });

  it("PUT 非法 args 返回 400", async () => {
    const res = await fetch(`${base}/api/agents/claude`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args: "not-array" }),
    });
    expect(res.status).toBe(400);
  });

  it("DELETE /api/agents/:id 删除非默认 agent", async () => {
    const res = await fetch(`${base}/api/agents/claude`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(config.agents.claude).toBeUndefined();
    expect(config.agents.opencode).toBeDefined();
  });

  it("DELETE 默认 agent 返回 400", async () => {
    const res = await fetch(`${base}/api/agents/opencode`, { method: "DELETE" });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain("默认 agent");
  });

  it("DELETE 不存在的 agent 返回 404", async () => {
    const res = await fetch(`${base}/api/agents/ghost`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("POST 非法 JSON 返回 400", async () => {
    const res = await fetch(`${base}/api/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{{{",
    });
    expect(res.status).toBe(400);
  });
});
