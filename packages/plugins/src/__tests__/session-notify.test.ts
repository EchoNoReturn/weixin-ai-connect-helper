import { describe, it, expect } from "bun:test";
import onSessionEnd from "../session-notify.ts";
import type { SessionEndContext } from "@yoyojcoder-weixin-ai/core";

describe("session-notify", () => {
  it("sends formatted notification", async () => {
    const notified: string[] = [];
    const ctx: SessionEndContext = {
      agentId: "opencode",
      sessionId: "s1",
      ownedByBridge: true,
      lastMessage: "test reply",
      durationMs: 200000,
      stopReason: "completed",
      notify: async (text) => { notified.push(text); },
    };
    await onSessionEnd(ctx);
    expect(notified).toHaveLength(1);
    expect(notified[0]).toContain("agent=opencode");
    expect(notified[0]).toContain("时长=3m20s");
    expect(notified[0]).toContain("结果=completed");
    expect(notified[0]).toContain("最后回复：test reply");
  });

  it("handles missing last message", async () => {
    const notified: string[] = [];
    const ctx: SessionEndContext = {
      agentId: "claude",
      sessionId: "s2",
      ownedByBridge: false,
      durationMs: 5000,
      stopReason: "error",
      notify: async (text) => { notified.push(text); },
    };
    await onSessionEnd(ctx);
    expect(notified[0]).toContain("agent=claude");
    expect(notified[0]).not.toContain("最后回复");
  });
});
