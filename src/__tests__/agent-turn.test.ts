import { describe, it, expect } from "bun:test";
import { runAgentTurn, type AgentTurnDeps, type AgentLike } from "../agent-turn.ts";
import type { PromptContext, SessionEndContext } from "@yoyojcoder-weixin-ai/core";

function makeCtx(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    routed: {
      message: { fromUserId: "u1@im.wechat", text: "你好", receivedAt: 0 },
      agentId: "opencode",
      sessionId: "u1@im.wechat:opencode",
    },
    systemPrompt: "",
    history: [],
    prompt: "你好",
    ...overrides,
  };
}

interface FakeSetup {
  deps: AgentTurnDeps;
  sent: Array<{ userId: string; delta: string }>;
  saved: Array<{ role: string; content: string }>;
  sessionEnds: SessionEndContext[];
  advance: (ms: number) => void;
}

function makeDeps(agent: AgentLike, opts: { minChars?: number; idleMs?: number; notifyPolicy?: "none" | "own" | "all"; ownedByBridge?: boolean; isNewAgentSession?: boolean } = {}): FakeSetup {
  const sent: FakeSetup["sent"] = [];
  const saved: FakeSetup["saved"] = [];
  const sessionEnds: SessionEndContext[] = [];
  let now = 1_000_000;
  return {
    sent,
    saved,
    sessionEnds,
    advance: (ms) => { now += ms; },
    deps: {
      agent,
      agentConfig: { command: "x", args: [], cwd: ".", notifyPolicy: opts.notifyPolicy ?? "own" },
      sendDelta: async (userId, delta) => { sent.push({ userId, delta }); },
      sessionStore: {
        saveMessage: (_s, role, content) => { saved.push({ role, content }); },
        get: () => ({ ownedByBridge: opts.ownedByBridge ?? true }),
      },
      onSessionEnd: async (ctx) => { sessionEnds.push(ctx); },
      streamFlushMinChars: opts.minChars ?? 10,
      streamFlushIdleMs: opts.idleMs ?? 1000,
      isNewAgentSession: opts.isNewAgentSession ?? true,
      now: () => now,
    },
  };
}

/** 模拟 ACP agent：按 chunks 依次触发 onChunk（累积全文），最后返回完整结果 */
function fakeAgent(chunks: string[], stopReason = "completed"): AgentLike & { receivedPrompt?: string } {
  const state: { receivedPrompt?: string } = {};
  return Object.assign(state, {
    async prompt(_s: string, text: string, onChunk: (full: string) => void) {
      state.receivedPrompt = text;
      let full = "";
      for (const c of chunks) {
        full += c;
        onChunk(full);
        // 让微任务队列推进（flushQueue 链）
        await Promise.resolve();
      }
      return { text: full, stopReason };
    },
  });
}

describe("runAgentTurn", () => {
  it("composes prompt with systemPrompt on first turn", async () => {
    const agent = fakeAgent(["ok"]);
    const { deps } = makeDeps(agent);
    await runAgentTurn(makeCtx({ systemPrompt: "你是助手" }), deps);
    expect(agent.receivedPrompt).toBe("你是助手\n\n你好");
  });

  it("does not inject systemPrompt when agent session already exists", async () => {
    const agent = fakeAgent(["ok"]);
    const { deps } = makeDeps(agent, { isNewAgentSession: false });
    await runAgentTurn(makeCtx({
      systemPrompt: "你是助手",
      history: [{ role: "user", content: "旧消息" }],
    }), deps);
    expect(agent.receivedPrompt).toBe("你好");
  });

  it("re-injects systemPrompt on new agent session despite DB history (bridge restart)", async () => {
    const agent = fakeAgent(["ok"]);
    const { deps } = makeDeps(agent, { isNewAgentSession: true });
    await runAgentTurn(makeCtx({
      systemPrompt: "你是助手",
      history: [{ role: "user", content: "重启前的旧消息" }],
    }), deps);
    expect(agent.receivedPrompt).toBe("你是助手\n\n你好");
  });

  it("streams deltas per coalescing policy and finalizes the rest", async () => {
    const agent = fakeAgent(["aaaaa", "bbbbb", "cc"]); // 10 chars → flush; then 2 left
    const { deps, sent } = makeDeps(agent);
    await runAgentTurn(makeCtx(), deps);
    // 第一次 update 达 10 字符冲刷；剩余 "cc" 由 finalize 冲刷
    expect(sent.map(s => s.delta)).toEqual(["aaaaabbbbb", "cc"]);
    expect(sent.every(s => s.userId === "u1@im.wechat")).toBe(true);
  });

  it("sends full text via finalize when below threshold", async () => {
    const agent = fakeAgent(["short"]);
    const { deps, sent } = makeDeps(agent);
    await runAgentTurn(makeCtx(), deps);
    expect(sent.map(s => s.delta)).toEqual(["short"]);
  });

  it("persists user and assistant messages", async () => {
    const agent = fakeAgent(["reply text"]);
    const { deps, saved } = makeDeps(agent);
    await runAgentTurn(makeCtx(), deps);
    expect(saved).toEqual([
      { role: "user", content: "你好" },
      { role: "assistant", content: "reply text" },
    ]);
  });

  it("fires onSessionEnd with notifyPolicy and ownedByBridge", async () => {
    const agent = fakeAgent(["done"]);
    const { deps, sessionEnds } = makeDeps(agent, { notifyPolicy: "all", ownedByBridge: false });
    const result = await runAgentTurn(makeCtx(), deps);
    expect(sessionEnds).toHaveLength(1);
    const se = sessionEnds[0]!;
    expect(se.agentId).toBe("opencode");
    expect(se.notifyPolicy).toBe("all");
    expect(se.ownedByBridge).toBe(false);
    expect(se.lastMessage).toBe("done");
    expect(se.stopReason).toBe("completed");
    expect(result.text).toBe("done");
  });

  it("notify callback sends to the originating user", async () => {
    const agent = fakeAgent(["done"]);
    const { deps, sent } = makeDeps(agent);
    const ctxs: SessionEndContext[] = [];
    const deps2 = { ...deps, onSessionEnd: async (c: SessionEndContext) => { ctxs.push(c); } };
    await runAgentTurn(makeCtx(), deps2);
    sent.length = 0; // 清空流式发送记录，只观察 notify 的发送
    await ctxs[0]!.notify("会话结束通知");
    expect(sent).toEqual([{ userId: "u1@im.wechat", delta: "会话结束通知" }]);
  });

  it("propagates agent errors", async () => {
    const agent: AgentLike = { async prompt() { throw new Error("agent crashed"); } };
    const { deps } = makeDeps(agent);
    await expect(runAgentTurn(makeCtx(), deps)).rejects.toThrow("agent crashed");
  });
});
