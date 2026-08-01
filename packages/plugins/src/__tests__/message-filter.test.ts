import { describe, it, expect } from "bun:test";
import onReceive from "../message-filter.ts";
import type { ParsedMessage } from "@yoyojcoder-weixin-ai/core";

function makeMsg(text: string): ParsedMessage {
  return { fromUserId: "test@im.wechat", text, receivedAt: Date.now() };
}

describe("message-filter", () => {
  it("truncates long messages", async () => {
    const msg = makeMsg("a".repeat(6000));
    let nextCalled = false;
    await onReceive(msg, async () => { nextCalled = true; });
    expect(msg.text.length).toBe(5000);
    expect(nextCalled).toBe(true);
  });

  it("passes short messages unchanged", async () => {
    const msg = makeMsg("short");
    await onReceive(msg, async () => {});
    expect(msg.text).toBe("short");
  });
});
