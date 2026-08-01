import { describe, it, expect } from "bun:test";
import { loadPlugins, runStage } from "../plugin-system.ts";
import type { ParsedMessage } from "../types.ts";

describe("loadPlugins", () => {
  it("returns empty registry for non-existent file", async () => {
    const reg = await loadPlugins("non-existent.json");
    expect(reg.onReceive).toEqual([]);
    expect(reg.onRoute).toEqual([]);
    expect(reg.beforePrompt).toEqual([]);
    expect(reg.onPrompt).toEqual([]);
    expect(reg.onSessionEnd).toEqual([]);
    expect(reg.beforeSend).toEqual([]);
  });
});

describe("runStage", () => {
  it("calls core when no hooks", async () => {
    const core = async (msg: ParsedMessage) => ({ ...msg, text: "processed" });
    const result = await runStage("test", [], { text: "hello" } as ParsedMessage, core);
    expect(result.text).toBe("processed");
  });

  it("runs hooks in order before core", async () => {
    const order: string[] = [];
    const hook1 = async (msg: ParsedMessage, next: () => Promise<void>) => {
      order.push("hook1");
      msg.text += "+h1";
      return next();
    };
    const hook2 = async (msg: ParsedMessage, next: () => Promise<void>) => {
      order.push("hook2");
      msg.text += "+h2";
      return next();
    };
    const core = async (msg: ParsedMessage) => {
      order.push("core");
      return msg;
    };
    const result = await runStage("test", [
      { name: "h1", handler: hook1 },
      { name: "h2", handler: hook2 },
    ], { text: "" } as ParsedMessage, core);
    expect(order).toEqual(["hook1", "hook2", "core"]);
    expect(result.text).toBe("+h1+h2");
  });

  it("hook can short-circuit by not calling next", async () => {
    const hook = async (msg: ParsedMessage, _next: () => Promise<void>) => {
      msg.text = "intercepted";
      return msg;
    };
    const core = async (msg: ParsedMessage) => {
      msg.text += "+core";
      return msg;
    };
    const result = await runStage("test", [{ name: "h", handler: hook }], { text: "" } as ParsedMessage, core);
    expect(result.text).toBe("intercepted+core");
  });
});
