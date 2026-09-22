import { describe, it, expect } from "bun:test";
import { composePrompt } from "../prompt-composer.ts";
import type { PromptContext } from "@yoyojcoder-weixin-ai/core";

function makeCtx(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    routed: {
      message: {
        channelId: "weixin-main",
        platform: "weixin",
        conversationId: "u@im.wechat",
        senderId: "u@im.wechat",
        text: "hi",
        receivedAt: 0,
      },
      agentId: "opencode",
      sessionId: "s1",
    },
    systemPrompt: "",
    history: [],
    prompt: "你好",
    ...overrides,
  };
}

describe("composePrompt", () => {
  it("prepends systemPrompt when agent session is new", () => {
    const ctx = makeCtx({ systemPrompt: "你是助手" });
    expect(composePrompt(ctx, true)).toBe("你是助手\n\n你好");
  });

  it("returns plain prompt when systemPrompt empty", () => {
    expect(composePrompt(makeCtx(), true)).toBe("你好");
  });

  it("returns plain prompt when systemPrompt is whitespace only", () => {
    expect(composePrompt(makeCtx({ systemPrompt: "   " }), true)).toBe("你好");
  });

  it("does not inject systemPrompt on existing agent session", () => {
    const ctx = makeCtx({
      systemPrompt: "你是助手",
      history: [{ role: "user", content: "之前的问题" }],
    });
    expect(composePrompt(ctx, false)).toBe("你好");
  });

  it("re-injects systemPrompt after bridge restart (history non-empty but ACP session new)", () => {
    // 回归：ACP session 不随桥重启存活，而 DB 历史持久；
    // 重启后首轮必须重新注入 systemPrompt，否则 agent 永久丢失人设
    const ctx = makeCtx({
      systemPrompt: "你是助手",
      history: [
        { role: "user", content: "重启前的问题" },
        { role: "assistant", content: "重启前的回答" },
      ],
    });
    expect(composePrompt(ctx, true)).toBe("你是助手\n\n你好");
  });
});
