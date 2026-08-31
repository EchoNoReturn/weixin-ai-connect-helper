import { describe, expect, test } from "bun:test";
import type { IncomingMessage } from "@yoyojcoder-weixin-ai/core";
import { WeixinChannelAdapter } from "../weixin/adapter.ts";

const creds = { accountId: "wx-account", baseUrl: "https://example.test", token: "secret" };

describe("WeixinChannelAdapter", () => {
  test("normalizes inbound WeChat messages", async () => {
    const states: string[] = [];
    const adapter = new WeixinChannelAdapter(creds, {
      channelId: "weixin-test",
      inboundRunner: async ({ onMessage }) => {
        await onMessage({
          fromUserId: "user@im.wechat",
          text: "hello",
          contextToken: "ctx-1",
          receivedAt: 123,
        });
      },
    });

    const incoming: IncomingMessage[] = [];
    await adapter.start({
      abortSignal: new AbortController().signal,
      onStateChange: (state) => states.push(state),
      onMessage: async (message) => {
        incoming.push(message);
      },
    });

    expect(incoming[0]).toEqual({
      channelId: "weixin-test",
      platform: "weixin",
      accountId: "wx-account",
      conversationId: "user@im.wechat",
      senderId: "user@im.wechat",
      text: "hello",
      receivedAt: 123,
      replyContext: { contextToken: "ctx-1" },
    });
    expect(states).toEqual(["starting", "connected", "stopped"]);
  });

  test("forwards reply context and returns delivery ids", async () => {
    const calls: unknown[][] = [];
    const adapter = new WeixinChannelAdapter(creds, {
      sender: {
        async sendText(...args) {
          calls.push(args);
          return ["wx-message-1"];
        },
      },
    });

    const receipt = await adapter.send({
      channelId: "weixin-main",
      conversationId: "user@im.wechat",
      text: "reply",
      replyContext: { contextToken: "ctx-2" },
    });

    expect(calls).toEqual([["user@im.wechat", "reply", "ctx-2"]]);
    expect(receipt.messageIds).toEqual(["wx-message-1"]);
  });
});
