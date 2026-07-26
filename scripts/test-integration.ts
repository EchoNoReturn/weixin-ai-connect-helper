import { describe, it, expect, mock, beforeEach } from "bun:test";
import { Pipeline, loadPlugins, createLogger } from "@yoyojcoder-weixin-ai/core";
import type { PluginRegistry, ParsedMessage, RoutedMessage, PromptContext, AgentResult } from "@yoyojcoder-weixin-ai/core";

/**
 * 集成测试：完整管道流程
 * Mock WeChat API + ACP agent，验证从接收到发送的完整链路
 */

function emptyRegistry(): PluginRegistry {
  return { onReceive: [], onRoute: [], beforePrompt: [], onPrompt: [], onSessionEnd: [], beforeSend: [] };
}

function makeMsg(text: string): ParsedMessage {
  return { fromUserId: "test@im.wechat", text, receivedAt: Date.now() };
}

describe("Full pipeline integration", () => {
  it("message flows through all stages", async () => {
    const order: string[] = [];
    const reg = emptyRegistry();

    // Plugin: message-filter at Stage 1
    reg.onReceive.push({
      name: "message-filter",
      handler: async (msg, next) => {
        order.push("plugin:filter");
        msg.text = msg.text.trim();
        return next();
      },
    });

    // Plugin: system-prompt at Stage 3
    reg.beforePrompt.push({
      name: "system-prompt",
      handler: async (ctx, next) => {
        order.push("plugin:system-prompt");
        (ctx as any)._customPrompt = "You are a helpful assistant.";
        return next();
      },
    });

    const sentMessages: string[] = [];

    const pipeline = new Pipeline(reg, {
      receive: {
        core: async (msg) => {
          order.push("stage:receive");
          return {
            message: msg,
            agentId: "opencode",
            sessionId: `${msg.fromUserId}:opencode`,
          } as RoutedMessage;
        },
      },
      route: {
        core: async (routed) => {
          order.push("stage:route");
          return routed;
        },
      },
      context: {
        core: async (routed) => {
          order.push("stage:context");
          return {
            routed,
            systemPrompt: (routed as any)._customPrompt ?? "",
            history: [],
            prompt: routed.message.text,
          } as PromptContext;
        },
      },
      execute: {
        core: async (ctx) => {
          order.push("stage:execute");
          return {
            ctx,
            text: "This is the agent response.",
            stopReason: "completed",
            durationMs: 500,
          } as AgentResult;
        },
      },
      send: {
        core: async (result) => {
          order.push("stage:send");
          sentMessages.push(result.text);
        },
      },
    });

    await pipeline.run(makeMsg("  hello world  "));

    expect(order).toEqual([
      "plugin:filter",
      "stage:receive",
      "stage:route",
      "plugin:system-prompt",
      "stage:context",
      "stage:execute",
      "stage:send",
    ]);
    expect(sentMessages).toEqual(["This is the agent response."]);
  });

  it("hook can modify agent result before send", async () => {
    const reg = emptyRegistry();

    // Plugin: add footer at Stage 4
    reg.onPrompt.push({
      name: "add-footer",
      handler: async (result, next) => {
        result.text += "\n---";
        return next();
      },
    });

    let sentText = "";
    const pipeline = new Pipeline(reg, {
      receive: { core: async (m) => ({ message: m, agentId: "opencode", sessionId: "s1" }) },
      route: { core: async (r) => r },
      context: { core: async (r) => ({ routed: r, systemPrompt: "", history: [], prompt: r.message.text }) },
      execute: { core: async (c) => ({ ctx: c, text: "reply", stopReason: "completed", durationMs: 100 }) },
      send: { core: async (r) => { sentText = r.text; } },
    });

    await pipeline.run(makeMsg("test"));
    expect(sentText).toBe("reply\n---");
  });

  it("session end hooks are called separately", async () => {
    const reg = emptyRegistry();
    const notifications: string[] = [];

    reg.onSessionEnd.push({
      name: "notify",
      handler: async (ctx) => {
        notifications.push(`ended:${ctx.agentId}`);
      },
    });

    const pipeline = new Pipeline(reg, {
      receive: { core: async (m) => m as any },
      route: { core: async (r) => r },
      context: { core: async (r) => r as any },
      execute: { core: async (r) => r as any },
      send: { core: async () => {} },
    });

    await pipeline.runSessionEndHooks({
      agentId: "opencode",
      sessionId: "s1",
      ownedByBridge: true,
      durationMs: 1000,
      stopReason: "completed",
      notify: async () => {},
    });

    expect(notifications).toEqual(["ended:opencode"]);
  });
});
