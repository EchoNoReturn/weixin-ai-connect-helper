import { describe, it, expect } from "bun:test";
import { Router } from "../router.ts";
import type { BridgeConfig } from "@yoyojcoder-weixin-ai/core";

function makeConfig(overrides?: Partial<BridgeConfig>): BridgeConfig {
  return {
    allowFrom: ["user1@im.wechat"],
    defaultAgent: "opencode",
    agents: { opencode: { command: "opencode", args: ["acp"], cwd: "." } },
    autoApprove: true,
    webPort: 3210,
    pluginsFile: "plugins.json",
    streamFlushMinChars: 200,
    streamFlushIdleMs: 3000,
    ...overrides,
  };
}

function makeMsg(userId: string, text: string) {
  return { fromUserId: userId, text, receivedAt: Date.now() };
}

describe("Router", () => {
  it("rejects non-whitelisted user", () => {
    const router = new Router(makeConfig());
    expect(() => router.parseRoute(makeMsg("unknown@im.wechat", "hello")))
      .toThrow("非白名单用户");
  });

  it("allows whitelisted user", () => {
    const router = new Router(makeConfig());
    const result = router.parseRoute(makeMsg("user1@im.wechat", "hello"));
    expect(result.agentId).toBe("opencode");
    expect(result.message.text).toBe("hello");
  });

  it("parses /oc prefix", () => {
    const router = new Router(makeConfig());
    const result = router.parseRoute(makeMsg("user1@im.wechat", "/oc do something"));
    expect(result.agentId).toBe("opencode");
    expect(result.message.text).toBe("do something");
  });

  it("parses /cc prefix", () => {
    const router = new Router(makeConfig());
    const result = router.parseRoute(makeMsg("user1@im.wechat", "/cc explain ACP"));
    expect(result.agentId).toBe("claude");
    expect(result.message.text).toBe("explain ACP");
  });

  it("parses /cx prefix", () => {
    const router = new Router(makeConfig());
    const result = router.parseRoute(makeMsg("user1@im.wechat", "/cx hello"));
    expect(result.agentId).toBe("codex");
  });

  it("remembers agent binding per user", () => {
    const router = new Router(makeConfig());
    router.parseRoute(makeMsg("user1@im.wechat", "/cc switch"));
    const result = router.parseRoute(makeMsg("user1@im.wechat", "continue"));
    expect(result.agentId).toBe("claude");
  });

  it("auto-binds first user when allowFrom empty", () => {
    const router = new Router(makeConfig({ allowFrom: [] }));
    const result = router.parseRoute(makeMsg("first@im.wechat", "hi"));
    expect(result.agentId).toBe("opencode");
    expect(() => router.parseRoute(makeMsg("second@im.wechat", "hi")))
      .toThrow("非白名单用户");
  });

  it("generates correct sessionId", () => {
    const router = new Router(makeConfig());
    const result = router.parseRoute(makeMsg("user1@im.wechat", "hello"));
    expect(result.sessionId).toBe("user1@im.wechat:opencode");
  });
});
