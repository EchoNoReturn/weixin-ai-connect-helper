import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApiServer, type ApiDeps } from "../api-server.ts";
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
};

const pluginsJson = {
  onReceive: [{ name: "message-filter", enabled: true, entry: "./plugins/message-filter.ts" }],
  onRoute: [],
  beforePrompt: [{ name: "system-prompt", enabled: true, entry: "./plugins/system-prompt.ts" }],
  onPrompt: [],
  onSessionEnd: [{ name: "session-notify", enabled: false, entry: "./plugins/session-notify.ts" }],
  beforeSend: [],
};

describe("api-server /api/plugins", () => {
  let server: ReturnType<typeof createApiServer>;
  let base: string;
  let dir: string;
  let pluginsFile: string;

  function makeDeps(withPlugins = true): ApiDeps {
    return {
      getStatus: () => ({ health: null, version: "t" }),
      getConfig: () => config,
      saveConfig: async (n) => n,
      pluginsFile: withPlugins ? pluginsFile : undefined,
    };
  }

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "wah-api-p-"));
    pluginsFile = path.join(dir, "plugins.json");
    writeFileSync(pluginsFile, JSON.stringify(pluginsJson));
  });

  afterEach(() => {
    server.stop(true);
    rmSync(dir, { recursive: true, force: true });
  });

  function start(deps: ApiDeps) {
    server = createApiServer({ port: 0, deps });
    base = `http://127.0.0.1:${server.port!}`;
  }

  it("GET /api/plugins 返回插件列表", async () => {
    start(makeDeps());
    const res = await fetch(`${base}/api/plugins`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.plugins).toHaveLength(3);
    const sn = body.plugins.find((p: any) => p.name === "session-notify");
    expect(sn.enabled).toBe(false);
    expect(sn.hooks).toEqual(["onSessionEnd"]);
  });

  it("PUT /api/plugins/:name/toggle 启用插件并写回文件", async () => {
    start(makeDeps());
    const res = await fetch(`${base}/api/plugins/session-notify/toggle`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.enabled).toBe(true);
    expect(body.restartRequired).toBe(true);
    // 文件已更新
    const onDisk = JSON.parse(require("node:fs").readFileSync(pluginsFile, "utf8"));
    expect(onDisk.onSessionEnd[0].enabled).toBe(true);
  });

  it("PUT 禁用已启用插件", async () => {
    start(makeDeps());
    const res = await fetch(`${base}/api/plugins/message-filter/toggle`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(200);
    const onDisk = JSON.parse(require("node:fs").readFileSync(pluginsFile, "utf8"));
    expect(onDisk.onReceive[0].enabled).toBe(false);
  });

  it("PUT 不存在的插件返回 404", async () => {
    start(makeDeps());
    const res = await fetch(`${base}/api/plugins/ghost/toggle`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(404);
  });

  it("PUT enabled 非布尔返回 400", async () => {
    start(makeDeps());
    const res = await fetch(`${base}/api/plugins/message-filter/toggle`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: "yes" }),
    });
    expect(res.status).toBe(400);
  });

  it("未注入 pluginsFile 返回 501", async () => {
    start(makeDeps(false));
    const res = await fetch(`${base}/api/plugins`);
    expect(res.status).toBe(501);
  });
});
