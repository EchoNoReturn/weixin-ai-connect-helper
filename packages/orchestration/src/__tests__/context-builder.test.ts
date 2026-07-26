import { describe, it, expect, mock } from "bun:test";

// Mock the db module before importing context-builder
mock.module("@yoyojcoder-weixin-ai/core", () => ({
  getDb: () => ({
    prepare: () => ({
      all: () => [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
      ],
    }),
  }),
}));

import { ContextBuilder } from "../context-builder.ts";
import type { RoutedMessage } from "@yoyojcoder-weixin-ai/core";

function makeRouted(text: string): RoutedMessage {
  return {
    message: { fromUserId: "user@im.wechat", text, receivedAt: Date.now() },
    agentId: "opencode",
    sessionId: "user@im.wechat:opencode",
  };
}

describe("ContextBuilder", () => {
  it("builds prompt context with history", async () => {
    const builder = new ContextBuilder();
    const ctx = await builder.build(makeRouted("what's next?"));
    expect(ctx.prompt).toBe("what's next?");
    expect(ctx.routed.agentId).toBe("opencode");
    expect(ctx.history).toHaveLength(2);
    expect(ctx.history[0]).toEqual({ role: "user", content: "hello" });
    expect(ctx.history[1]).toEqual({ role: "assistant", content: "hi there" });
  });
});
