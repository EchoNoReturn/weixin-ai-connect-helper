import { describe, expect, test } from "bun:test";
import { assertAdapterOwnsMessage } from "../channel.ts";
import type { ChannelAdapter, IncomingMessage } from "../channel.ts";

describe("channel contracts", () => {
  test("accepts a minimal text adapter", () => {
    const received: IncomingMessage[] = [];
    const adapter: ChannelAdapter = {
      channelId: "test-main",
      platform: "test",
      capabilities: {
        text: true,
        markdown: false,
        images: false,
        files: false,
        messageReplies: false,
        streaming: false,
      },
      async start(options) {
        await options.onMessage({
          channelId: "test-main",
          platform: "test",
          conversationId: "conversation-1",
          senderId: "user-1",
          text: "hello",
          receivedAt: 1,
        });
      },
      async send(message) {
        assertAdapterOwnsMessage(this, message);
        return {
          channelId: this.channelId,
          conversationId: message.conversationId,
          messageIds: ["out-1"],
          sentAt: 2,
        };
      },
    };

    return adapter.start({
      abortSignal: new AbortController().signal,
      onMessage: async (message) => {
        received.push(message);
      },
    }).then(() => expect(received[0]?.senderId).toBe("user-1"));
  });

  test("rejects outgoing messages for another adapter", () => {
    expect(() =>
      assertAdapterOwnsMessage(
        { channelId: "weixin-main" },
        { channelId: "webhook-local" },
      ),
    ).toThrow("渠道不匹配");
  });
});
