import { describe, it, expect } from "bun:test";
import onReceive from "../message-filter.ts";
import type { ParsedMessage } from "@yoyojcoder-weixin-ai/core";

function makeMsg(text: string): ParsedMessage {
  return { channelId: "weixin-main", platform: "weixin", conversationId: "test@im.wechat", senderId: "test@im.wechat", text, receivedAt: Date.now() };
}

describe("message-filter", () => {
  it("truncates long messages", async () => {
    const msg = makeMsg("a".repeat(6000));
    const result = onReceive(msg);
    expect(result.text.length).toBe(5000);
  });

  it("passes short messages unchanged", async () => {
    const msg = makeMsg("short");
    const result = onReceive(msg);
    expect(result.text).toBe("short");
  });
});
