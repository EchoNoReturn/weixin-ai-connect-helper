import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// 真实 SQLite（临时目录），避免 mock.module 泄漏污染其他测试文件
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

function makeRouted(text: string): RoutedMessage {
  return {
    message: { channelId: "weixin-main", platform: "weixin", conversationId: "user@im.wechat", senderId: "user@im.wechat", text, receivedAt: Date.now() },
    agentId: "opencode",
    sessionId: "user@im.wechat:opencode",
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
});
