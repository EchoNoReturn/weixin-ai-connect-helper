import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApiServer, type ApiDeps } from "../api-server.ts";
import type { BridgeConfig } from "@yoyojcoder-weixin-ai/core";
import type { BridgeHealth } from "../../bridge.ts";

const baseConfig: BridgeConfig = {
  allowFrom: ["u1@im.wechat"],
  defaultAgent: "opencode",
  agents: { opencode: { command: "opencode", args: ["acp"], cwd: "." } },
  autoApprove: true,
  webPort: 3210,
  pluginsFile: "plugins.json",
  streamFlushMinChars: 200,
  streamFlushIdleMs: 3000,
};

function makeDeps() {
  let config = structuredClone(baseConfig);
  const state = {
    health: {
      status: "connected",
      accountId: "test-acc",
      reconnectAttempts: 0,
      startedAt: Date.now() - 60_000,
    } as BridgeHealth,
    savedConfigs: [] as BridgeConfig[],
  };
  const deps: ApiDeps = {
    getStatus: () => ({ health: state.health, version: "0.0.4-test" }),
    getConfig: () => config,
    saveConfig: async (next) => {
      state.savedConfigs.push(next);
      config = next;
      return next;
    },
  };
  return { deps, state, getConfig: () => config };
}

describe("api-server", () => {
  let server: ReturnType<typeof createApiServer>;
  let base: string;
  let ctx: ReturnType<typeof makeDeps>;
  let staticDir: string;

  beforeAll(() => {
    ctx = makeDeps();
    staticDir = mkdtempSync(path.join(tmpdir(), "wah-web-"));
    writeFileSync(path.join(staticDir, "index.html"), "<html>console</html>");
    mkdirSync(path.join(staticDir, "assets"));
    writeFileSync(path.join(staticDir, "assets", "app.js"), "console.log(1)");

    server = createApiServer({ port: 0, deps: ctx.deps, staticDir });
    base = `http://127.0.0.1:${server.port!}`;
  });

  afterAll(() => {
    server.stop(true);
    rmSync(staticDir, { recursive: true, force: true });
  });

  it("GET /api/status 返回桥接健康状态与版本", async () => {
    const res = await fetch(`${base}/api/status`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.version).toBe("0.0.4-test");
    expect(body.bridge.status).toBe("connected");
    expect(body.bridge.accountId).toBe("test-acc");
    expect(typeof body.now).toBe("number");
  });

  it("GET /api/status 桥未运行时返回 stopped", async () => {
    ctx.state.health = null as unknown as BridgeHealth;
    const res = await fetch(`${base}/api/status`);
    const body = await res.json() as any;
    expect(body.bridge.status).toBe("stopped");
    ctx.state.health = { status: "connected", reconnectAttempts: 0, startedAt: 0 } as BridgeHealth;
  });

  it("GET /api/config 返回当前配置", async () => {
    const res = await fetch(`${base}/api/config`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.defaultAgent).toBe("opencode");
    expect(body.streamFlushMinChars).toBe(200);
  });

  it("PUT /api/config 合并白名单字段并持久化", async () => {
    const res = await fetch(`${base}/api/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoApprove: false, streamFlushMinChars: 500 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.config.autoApprove).toBe(false);
    expect(body.config.streamFlushMinChars).toBe(500);
    expect(body.restartRequired).toBe(true);
    expect(ctx.state.savedConfigs).toHaveLength(1);
    // 未提及字段保持原值
    expect(body.config.defaultAgent).toBe("opencode");
  });

  it("PUT /api/config 忽略非白名单字段", async () => {
    const res = await fetch(`${base}/api/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evilField: "hack", autoApprove: true }),
    });
    const body = await res.json() as any;
    expect(body.config.evilField).toBeUndefined();
    expect(body.config.autoApprove).toBe(true);
  });

  it("PUT /api/config 非法 JSON 返回 400", async () => {
    const res = await fetch(`${base}/api/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain("JSON");
  });

  it("PUT /api/config 非对象返回 400", async () => {
    const res = await fetch(`${base}/api/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([1, 2, 3]),
    });
    expect(res.status).toBe(400);
  });

  it("未知 API 返回 404", async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
  });

  it("DELETE /api/config 返回 404", async () => {
    const res = await fetch(`${base}/api/config`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("静态资源：/ 返回 index.html 且 Content-Type 为 text/html（回归：曾是 octet-stream 导致浏览器下载）", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Content-Disposition")).toBeNull();
    expect(await res.text()).toContain("console");
  });

  it("静态资源：/assets/app.js 返回 JS", async () => {
    const res = await fetch(`${base}/assets/app.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("javascript");
  });

  it("SPA fallback：无扩展名路径回退 index.html 且 Content-Type 为 text/html", async () => {
    const res = await fetch(`${base}/settings/agents`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Content-Disposition")).toBeNull();
    expect(await res.text()).toContain("console");
  });

  it("目录路径解析到其下 index.html 且 Content-Type 为 text/html", async () => {
    mkdirSync(path.join(staticDir, "docs"), { recursive: true });
    writeFileSync(path.join(staticDir, "docs", "index.html"), "<html>docs page</html>");
    const res = await fetch(`${base}/docs`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(await res.text()).toContain("docs page");
  });

  it("带扩展名的缺失资源返回 404", async () => {
    const res = await fetch(`${base}/missing.css`);
    expect(res.status).toBe(404);
  });

  it("目录穿越被拒绝", async () => {
    const res = await fetch(`${base}/..%2F..%2Fpackage.json`);
    expect([403, 404]).toContain(res.status);
  });

  it("无 staticDir 时页面路径返回 503 提示", async () => {
    const s2 = createApiServer({ port: 0, deps: ctx.deps });
    try {
      const res = await fetch(`http://127.0.0.1:${s2.port!}/`);
      expect(res.status).toBe(503);
      const body = await res.json() as any;
      expect(body.error).toContain("build:web");
    } finally {
      s2.stop(true);
    }
  });

  it("同名前缀兄弟目录不可被静态服务（回归：裸 startsWith 误判）", async () => {
    // staticDir 为 <tmp>/wah-web-XXX；创建 wah-web-XXX-backup 兄弟目录
    const sibling = `${staticDir}-backup`;
    mkdirSync(sibling, { recursive: true });
    writeFileSync(path.join(sibling, "secret.txt"), "top secret");
    try {
      const res = await fetch(`${base}/..%2F${path.basename(staticDir)}-backup%2Fsecret.txt`);
      expect(res.status).toBe(403);
    } finally {
      rmSync(sibling, { recursive: true, force: true });
    }
  });

  it("PUT /api/config 非法字段类型返回 400 且不写盘", async () => {
    const savedBefore = ctx.state.savedConfigs.length;
    const res = await fetch(`${base}/api/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webPort: "abc" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain("webPort");
    expect(ctx.state.savedConfigs.length).toBe(savedBefore);

    const res2 = await fetch(`${base}/api/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agents: 42 }),
    });
    expect(res2.status).toBe(400);
  });

  it("写操作 CSRF 防护：跨站 Origin 被拒绝", async () => {
    const res = await fetch(`${base}/api/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example.com" },
      body: JSON.stringify({ autoApprove: false }),
    });
    expect(res.status).toBe(403);
  });

  it("写操作 CSRF 防护：本机 Origin 放行", async () => {
    const res = await fetch(`${base}/api/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
      body: JSON.stringify({ autoApprove: true }),
    });
    expect(res.status).toBe(200);
  });

  it("写操作 CSRF 防护：POST/PUT 缺少 application/json 返回 415", async () => {
    // 跨站 no-cors 请求只能携带 text/plain 等简单 Content-Type
    const res = await fetch(`${base}/api/agents`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ id: "x", command: "evil" }),
    });
    expect(res.status).toBe(415);
  });
});
