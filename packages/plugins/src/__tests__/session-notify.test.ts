import { describe, it, expect } from "bun:test";
import onSessionEnd from "../session-notify.ts";
import type { SessionEndContext } from "@yoyojcoder-weixin-ai/core";

function makeCtx(overrides: Partial<SessionEndContext> = {}) {
  const notified: string[] = [];
  const ctx: SessionEndContext = {
    agentId: "opencode",
    sessionId: "s1",
    ownedByBridge: true,
    notifyPolicy: "own",
    lastMessage: "test reply",
    durationMs: 200000,
    stopReason: "completed",
    notify: async (text) => { notified.push(text); },
    ...overrides,
  };
  return { ctx, notified };
}

describe("session-notify", () => {
  it("sends formatted notification", async () => {
    const { ctx, notified } = makeCtx();
    await onSessionEnd(ctx);
    expect(notified).toHaveLength(1);
    expect(notified[0]).toContain("agent=opencode");
    expect(notified[0]).toContain("时长=3m20s");
    expect(notified[0]).toContain("结果=completed");
    expect(notified[0]).toContain("最后回复：test reply");
  });

  it("handles missing last message", async () => {
    const { ctx, notified } = makeCtx({
      agentId: "claude",
      notifyPolicy: "all",
      ownedByBridge: false,
      lastMessage: undefined,
      durationMs: 5000,
      stopReason: "error",
    });
    await onSessionEnd(ctx);
    expect(notified[0]).toContain("agent=claude");
    expect(notified[0]).not.toContain("最后回复");
  });

  it('notifyPolicy "none" never notifies', async () => {
    const { ctx, notified } = makeCtx({ notifyPolicy: "none" });
    await onSessionEnd(ctx);
    expect(notified).toEqual([]);
  });

  it('notifyPolicy "own" skips sessions not owned by bridge', async () => {
    const { ctx, notified } = makeCtx({ notifyPolicy: "own", ownedByBridge: false });
    await onSessionEnd(ctx);
    expect(notified).toEqual([]);
  });

  it('notifyPolicy "own" notifies bridge-owned sessions', async () => {
    const { ctx, notified } = makeCtx({ notifyPolicy: "own", ownedByBridge: true });
    await onSessionEnd(ctx);
    expect(notified).toHaveLength(1);
  });

  it('notifyPolicy "all" notifies even non-bridge sessions', async () => {
    const { ctx, notified } = makeCtx({ notifyPolicy: "all", ownedByBridge: false });
    await onSessionEnd(ctx);
    expect(notified).toHaveLength(1);
  });
});
