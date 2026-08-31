import { afterEach, describe, expect, test } from "bun:test";
import { LocalWebhookChannelAdapter } from "../webhook/adapter.ts";

const controllers: AbortController[] = [];

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.abort();
});

describe("LocalWebhookChannelAdapter", () => {
  test("round-trips an inbound message through send", async () => {
    const controller = new AbortController();
    controllers.push(controller);
    const adapter = new LocalWebhookChannelAdapter({ port: 0, token: "test-token" });
    const running = adapter.start({
      abortSignal: controller.signal,
      onMessage: async (incoming) => {
        await adapter.send({
          channelId: incoming.channelId,
          conversationId: incoming.conversationId,
          text: `echo:${incoming.text}`,
          replyContext: incoming.replyContext,
        });
      },
    });

    const response = await fetch(`${adapter.url}/v1/messages`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ senderId: "local-user", text: "hello" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "echo:hello" });

    controller.abort();
    await running;
  });

  test("requires authentication when configured", async () => {
    const controller = new AbortController();
    controllers.push(controller);
    const adapter = new LocalWebhookChannelAdapter({ port: 0, token: "secret" });
    const running = adapter.start({ abortSignal: controller.signal, onMessage: async () => {} });
    const response = await fetch(`${adapter.url}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ senderId: "user", text: "hello" }),
    });
    expect(response.status).toBe(401);
    controller.abort();
    await running;
  });

  test("refuses non-loopback listening without a token", () => {
    expect(() => new LocalWebhookChannelAdapter({ hostname: "0.0.0.0" }))
      .toThrow("必须配置 token");
  });
});
