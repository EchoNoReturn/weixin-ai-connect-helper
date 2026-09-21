import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tmpState = mkdtempSync(path.join(tmpdir(), "wah-cb-"));
process.env.BRIDGE_STATE_DIR = tmpState;

const { ContextBuilder } = await import("../context-builder.ts");
const { SessionManager } = await import("../session-manager.ts");
const { closeDb } = await import("@yoyojcoder-weixin-ai/core");
import type { RoutedMessage } from "@yoyojcoder-weixin-ai/core";

afterAll(async () => {
  closeDb();
  await Bun.sleep(100);
  try { rmSync(tmpState, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
});

function makeRouted(text: string, userId = "user@im.wechat"): RoutedMessage {
  return {
    message: { fromUserId: userId, text, receivedAt: Date.now() },
    agentId: "opencode",
    sessionId: `${userId}:opencode`,
  };
}

describe("ContextBuilder", () => {
  it("builds prompt context with history", async () => {
    const mgr = new SessionManager();
    mgr.getOrCreate("user@im.wechat", "opencode");
    mgr.saveMessage("user@im.wechat:opencode", "user", "hello");
    mgr.saveMessage("user@im.wechat:opencode", "assistant", "hi there");

    const builder = new ContextBuilder();
    const ctx = await builder.build(makeRouted("what's next?"));
    expect(ctx.prompt).toBe("what's next?");
    expect(ctx.routed.agentId).toBe("opencode");
    expect(ctx.history).toHaveLength(2);
    expect(ctx.history[0]).toEqual({ role: "user", content: "hello" });
    expect(ctx.history[1]).toEqual({ role: "assistant", content: "hi there" });
  });

  it("returns empty history for new session", async () => {
    const builder = new ContextBuilder();
    const ctx = await builder.build(makeRouted("hi", "fresh@im.wechat"));
    expect(ctx.history).toEqual([]);
    expect(ctx.systemPrompt).toBe("");
  });
});
