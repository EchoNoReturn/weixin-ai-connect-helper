import { describe, it, expect } from "bun:test";
import beforePrompt from "../system-prompt.ts";
import type { PromptContext } from "@yoyojcoder-weixin-ai/core";

function makeCtx(): PromptContext {
  return {
    routed: {
      message: { channelId: "weixin-main", platform: "weixin", conversationId: "test@im.wechat", senderId: "test@im.wechat", text: "hello", receivedAt: Date.now() },
      agentId: "opencode",
      sessionId: "s1",
    },
    systemPrompt: "",
    history: [],
    prompt: "hello",
  };
}

describe("system-prompt", () => {
  it("sets system prompt", async () => {
    const ctx = makeCtx();
    const result = beforePrompt(ctx);
    expect(result.systemPrompt).toBe("你是一个 AI 助手，通过微信与用户交互。");
  });
});
