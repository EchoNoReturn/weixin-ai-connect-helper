import { describe, expect, test } from "bun:test";
import type { IncomingMessage } from "@yoyojcoder-weixin-ai/core";
import { WeixinChannelAdapter } from "../weixin/adapter.ts";

const creds = { accountId: "wx-account", baseUrl: "https://example.test", token: "secret" };

describe("WeixinChannelAdapter", () => {
  test("startup sends to login owner using restored context, only once across reconnects", async () => {
    const sent: unknown[][] = [];
    const adapter = new WeixinChannelAdapter({ ...creds, userId: "owner" }, {
      startupText: "启动通知",
      contextStore: { restore: () => {}, get: () => "saved-ctx", set: () => {} },
      sender: { sendText: async (...args) => { sent.push(args); return ["id"]; } },
      inboundRunner: async () => {},
    });
    const options = { abortSignal: new AbortController().signal, onMessage: async () => {} };
    await adapter.start(options);
    await adapter.start(options);
    expect(sent).toEqual([["owner", "启动通知", "saved-ctx"]]);
  });

  test("startup failure does not stop receiving; retries only for owner with fresh context", async () => {
    const sent: unknown[][] = [];
    const stored: unknown[][] = [];
    const received: string[] = [];
    const adapter = new WeixinChannelAdapter({ ...creds, userId: "owner" }, {
      startupText: "启动通知",
      contextStore: { restore: () => {}, get: () => undefined, set: (...args) => { stored.push(args); } },
      sender: { sendText: async (...args) => {
        sent.push(args);
        if (sent.length === 1) throw new Error("context expired");
        return ["id"];
      } },
      inboundRunner: async ({ onMessage }) => {
        for (const user of ["stranger", "owner", "owner"]) {
          await onMessage({ fromUserId: user, text: "hello", contextToken: "fresh", receivedAt: 0 });
        }
      },
    });
    await adapter.start({ abortSignal: new AbortController().signal, onMessage: async (msg) => { received.push(msg.senderId); } });
    expect(sent).toEqual([["owner", "启动通知", undefined], ["owner", "启动通知", "fresh"]]);
    expect(received).toEqual(["stranger", "owner", "owner"]);
    expect(stored).toContainEqual([creds.accountId, "owner", "fresh"]);
  });

  test("missing login owner never sends host information to arbitrary senders", async () => {
    let sends = 0;
    const adapter = new WeixinChannelAdapter(creds, {
      startupText: "host details",
      contextStore: { restore: () => {}, get: () => undefined, set: () => {} },
      sender: { sendText: async () => { sends++; return []; } },
      inboundRunner: async ({ onMessage }) => { await onMessage({ fromUserId: "stranger", text: "hello", receivedAt: 0 }); },
    });
    await adapter.start({ abortSignal: new AbortController().signal, onMessage: async () => {} });
    expect(sends).toBe(0);
  });
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
