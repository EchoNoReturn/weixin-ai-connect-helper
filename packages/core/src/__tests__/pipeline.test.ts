import { describe, it, expect } from "bun:test";
import { Pipeline } from "../pipeline.ts";
import type { PluginRegistry } from "../plugin-system.ts";
import type { ParsedMessage, RoutedMessage, PromptContext, AgentResult } from "../types.ts";

function emptyRegistry(): PluginRegistry {
  return {
    onReceive: [],
    onRoute: [],
    beforePrompt: [],
    onPrompt: [],
    onSessionEnd: [],
    beforeSend: [],
  };
}

function makeMsg(text: string): ParsedMessage {
  return { fromUserId: "test@im.wechat", text, receivedAt: Date.now() };
}

describe("Pipeline", () => {
  it("runs all 5 stages in order", async () => {
    const order: string[] = [];
    const reg = emptyRegistry();
    const pipeline = new Pipeline(reg, {
      receive: { core: async (msg) => { order.push("receive"); return { message: msg, agentId: "opencode", sessionId: "s1" } as RoutedMessage; } },
      route: { core: async (r) => { order.push("route"); return r; } },
      context: { core: async (r) => { order.push("context"); return { routed: r, systemPrompt: "", history: [], prompt: r.message.text } as PromptContext; } },
      execute: { core: async (c) => { order.push("execute"); return { ctx: c, text: "reply", stopReason: "completed", durationMs: 100 } as AgentResult; } },
      send: { core: async (r) => { order.push("send"); } },
    });
    await pipeline.run(makeMsg("hello"));
    expect(order).toEqual(["receive", "route", "context", "execute", "send"]);
  });

  it("plugins modify data at each stage", async () => {
    const reg = emptyRegistry();
    reg.onReceive.push({
      name: "add-prefix",
      handler: async (msg, next) => { msg.text = "[filtered]" + msg.text; return next(); },
    });
    reg.beforePrompt.push({
      name: "set-prompt",
      handler: async (ctx, next) => { (ctx as any)._customPrompt = "system"; return next(); },
    });

    let capturedPrefix = "";
    let capturedPrompt = "";
    const pipeline = new Pipeline(reg, {
      receive: { core: async (msg) => { capturedPrefix = msg.text.slice(0, 10); return { message: msg, agentId: "opencode", sessionId: "s1" }; } },
      route: { core: async (r) => r },
      context: { core: async (r) => ({ routed: r, systemPrompt: (r as any)._customPrompt ?? "", history: [], prompt: r.message.text }) },
      execute: { core: async (c) => { capturedPrompt = c.systemPrompt; return { ctx: c, text: "", stopReason: "completed", durationMs: 0 }; } },
      send: { core: async () => {} },
    });
    await pipeline.run(makeMsg("hello"));
    expect(capturedPrefix).toBe("[filtered]");
    expect(capturedPrompt).toBe("system");
  });

  it("runSessionEndHooks calls all handlers", async () => {
    const called: string[] = [];
    const reg = emptyRegistry();
    reg.onSessionEnd.push({
      name: "tracker",
      handler: async (ctx) => { called.push(ctx.agentId); },
    });
    reg.onSessionEnd.push({
      name: "tracker2",
      handler: async (ctx) => { called.push(ctx.agentId + "!"); },
    });

    const pipeline = new Pipeline(reg, {
      receive: { core: async (r) => r as any },
      route: { core: async (r) => r as any },
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
    expect(called).toEqual(["opencode", "opencode!"]);
  });
});
