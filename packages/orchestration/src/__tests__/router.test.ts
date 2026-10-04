import { describe, it, expect } from "bun:test";
import { Router } from "../router.ts";
import type { BridgeConfig } from "@yoyojcoder-weixin-ai/core";
import type { AccessStatus, AccessStore } from "../access-manager.ts";

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
    channels: [{ type: "weixin", id: "weixin-main" }],
    ...overrides,
  };
}

function makeMsg(userId: string, text: string) {
  return {
    channelId: "weixin-main",
    platform: "weixin",
    conversationId: userId,
    senderId: userId,
    text,
    receivedAt: Date.now(),
  };
}

class MemoryAccessStore implements AccessStore {
  private statuses = new Map<string, AccessStatus>();

  getStatus(userId: string): AccessStatus | undefined {
    return this.statuses.get(userId);
  }

  recordPending(userId: string): void {
    if (!this.statuses.has(userId)) this.statuses.set(userId, "pending");
  }

  approve(userId: string): void {
    this.statuses.set(userId, "approved");
  }

  revoke(userId: string): void {
    this.statuses.set(userId, "revoked");
  }
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

  it("records an unknown user as pending when allowFrom is empty", () => {
    const access = new MemoryAccessStore();
    const router = new Router(makeConfig({ allowFrom: [] }), access);
    expect(() => router.parseRoute(makeMsg("first@im.wechat", "hi")))
      .toThrow("非白名单用户");
    expect(access.getStatus("first@im.wechat")).toBe("pending");
  });

  it("allows a locally approved user when allowFrom is empty", () => {
    const access = new MemoryAccessStore();
    access.approve("first@im.wechat");
    const router = new Router(makeConfig({ allowFrom: [] }), access);
    const result = router.parseRoute(makeMsg("first@im.wechat", "hi"));
    expect(result.agentId).toBe("opencode");
  });

  it("auto-authorizes the channel owner without approval", () => {
    const access = new MemoryAccessStore();
    const owners = new Map([["weixin-main", "owner@im.wechat"]]);
    const router = new Router(makeConfig({ allowFrom: [] }), access, owners);
    const result = router.parseRoute(makeMsg("owner@im.wechat", "hi"));
    expect(result.agentId).toBe("opencode");
    expect(access.getStatus("owner@im.wechat")).toBeUndefined();
  });

  it("still requires approval for non-owner senders", () => {
    const access = new MemoryAccessStore();
    const owners = new Map([["weixin-main", "owner@im.wechat"]]);
    const router = new Router(makeConfig({ allowFrom: [] }), access, owners);
    expect(() => router.parseRoute(makeMsg("other@im.wechat", "hi"))).toThrow("非白名单用户");
    expect(access.getStatus("other@im.wechat")).toBe("pending");
  });

  it("lets an explicit revoke override owner auto-authorization", () => {
    const access = new MemoryAccessStore();
    access.revoke("owner@im.wechat");
    const owners = new Map([["weixin-main", "owner@im.wechat"]]);
    const router = new Router(makeConfig({ allowFrom: [] }), access, owners);
    expect(() => router.parseRoute(makeMsg("owner@im.wechat", "hi"))).toThrow("非白名单用户");
  });

  it("authorizes the owner even when allowFrom lists other users", () => {
    const owners = new Map([["weixin-main", "owner@im.wechat"]]);
    const router = new Router(makeConfig({ allowFrom: ["user1@im.wechat"] }), undefined, owners);
    expect(router.parseRoute(makeMsg("owner@im.wechat", "hi")).agentId).toBe("opencode");
  });

  it("does not treat an owner of another channel as trusted here", () => {
    const owners = new Map([["webhook-local", "owner@im.wechat"]]);
    const access = new MemoryAccessStore();
    const router = new Router(makeConfig({ allowFrom: [] }), access, owners);
    expect(() => router.parseRoute(makeMsg("owner@im.wechat", "hi"))).toThrow("非白名单用户");
  });

  it("generates correct sessionId", () => {
    const router = new Router(makeConfig());
    const result = router.parseRoute(makeMsg("user1@im.wechat", "hello"));
    expect(result.sessionId).toBe("user1@im.wechat:opencode");
  });

  it("namespaces access, binding, and sessions for other channels", () => {
    const access = new MemoryAccessStore();
    access.approve("webhook-local:user1");
    const router = new Router(makeConfig({ allowFrom: [] }), access);
    const message = {
      ...makeMsg("user1", "/cc switch"),
      channelId: "webhook-local",
      platform: "webhook",
      conversationId: "room-1",
    };
    const routed = router.parseRoute(message);
    expect(routed.sessionId).toBe("webhook-local:room-1:claude");
    expect(routed.agentId).toBe("claude");
  });
});
