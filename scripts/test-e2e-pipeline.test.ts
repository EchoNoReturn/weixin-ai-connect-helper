import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// 隔离 DB：用临时 BRIDGE_STATE_DIR，避免污染真实 ~/.wah/bridge.db
const tmpState = mkdtempSync(path.join(tmpdir(), "wah-it-"));
process.env.BRIDGE_STATE_DIR = tmpState;

const { Pipeline, closeDb } = await import("@yoyojcoder-weixin-ai/core");
const { Router, ContextBuilder, SessionManager } = await import("@yoyojcoder-weixin-ai/orchestration");
const { runAgentTurn } = await import("../src/agent-turn.ts");
const sessionNotify = (await import("@yoyojcoder-weixin-ai/plugins/src/session-notify.ts")).default;
const messageFilter = (await import("@yoyojcoder-weixin-ai/plugins/src/message-filter.ts")).default;
const systemPrompt = (await import("@yoyojcoder-weixin-ai/plugins/src/system-prompt.ts")).default;
import type { BridgeConfig, IncomingMessage, PluginRegistry } from "@yoyojcoder-weixin-ai/core";
import type { AgentLike } from "../src/agent-turn.ts";

/**
 * 端到端集成：Stage 1-5 全链路（多渠道架构）
 * 渠道消息 → 过滤插件 → 路由 → 上下文(systemPrompt) → runAgentTurn(流式+持久化+sessionEnd) → 发送
 * fake ACP agent + fake 渠道发送，真实 SQLite（临时目录）
 */

const config: BridgeConfig = {
  allowFrom: ["u1@im.wechat"],
  defaultAgent: "opencode",
  agents: {
    opencode: { command: "opencode", args: ["acp"], cwd: ".", notifyPolicy: "own" },
  },
  autoApprove: true,
  webPort: 3210,
  pluginsFile: "plugins.json",
  streamFlushMinChars: 10,
  streamFlushIdleMs: 1000,
  channels: [{ type: "weixin", id: "weixin-main", enabled: true }],
};

function makeRegistry(): PluginRegistry {
  return {
    onReceive: [{ name: "message-filter", handler: messageFilter }],
    onRoute: [],
    beforePrompt: [{ name: "system-prompt", handler: systemPrompt }],
    onPrompt: [],
    onSessionEnd: [{ name: "session-notify", handler: sessionNotify }],
    beforeSend: [],
  };
}

/** fake ACP agent：分块输出累积全文 */
function fakeAgent(chunks: string[]): AgentLike & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    async prompt(_s, text, onChunk) {
      prompts.push(text);
      let full = "";
      for (const c of chunks) {
        full += c;
        onChunk(full);
        await Promise.resolve();
      }
      return { text: full, stopReason: "completed" };
    },
  };
}

interface Harness {
  pipeline: InstanceType<typeof Pipeline>;
  agent: ReturnType<typeof fakeAgent>;
  sent: string[];           // 渠道收到的消息（按序）
  sessionMgr: InstanceType<typeof SessionManager>;
  now: () => number;
  advance: (ms: number) => void;
}

function makeHarness(chunks: string[], extraUsers: string[] = [], streaming = true): Harness {
  const agent = fakeAgent(chunks);
  const sent: string[] = [];
  const sessionMgr = new SessionManager();
  const cfg: BridgeConfig = { ...config, allowFrom: [...config.allowFrom, ...extraUsers] };
  let now = 1_000_000;
  // 模拟 ACP 侧 session 存续（与 AcpAgent.hasSession 同语义）：
  // agent 进程内每个 sessionId 只创建一次，桥重启后重建
  const agentSessions = new Set<string>();

  const harness: Harness = {
    agent,
    sent,
    sessionMgr,
    now: () => now,
    advance: (ms) => { now += ms; },
    pipeline: null as unknown as Harness["pipeline"],
  };

  const pipeline: InstanceType<typeof Pipeline> = new Pipeline(makeRegistry(), {
    receive: { core: async (msg: IncomingMessage) => new Router(cfg).parseRoute(msg) },
    route: { core: async (routed) => routed },
    context: { core: async (routed) => new ContextBuilder().build(routed) },
    execute: {
      core: async (ctx) => {
        // 与生产 bridge.ts 一致：先确保 sessions 表有记录
        sessionMgr.getOrCreate(ctx.routed.message.senderId, ctx.routed.agentId, ctx.routed.sessionId);
        const isNewAgentSession = !agentSessions.has(ctx.routed.sessionId);
        agentSessions.add(ctx.routed.sessionId);
        return runAgentTurn(ctx, {
          agent,
          agentConfig: config.agents[ctx.routed.agentId]!,
          streaming,
          sendDelta: async (delta) => { sent.push(delta); },
          sendText: async (text) => { sent.push(text); },
          sessionStore: sessionMgr,
          streamFlushMinChars: config.streamFlushMinChars,
          streamFlushIdleMs: config.streamFlushIdleMs,
          isNewAgentSession,
          now: harness.now,
        });
      },
    },
    send: {
      core: async (result) => {
        if (result.streamed) {
          if (!result.text.trim() && result.stopReason !== "completed") {
            sent.push(`[agent 未返回内容] stopReason=${result.stopReason}`);
          }
        } else if (result.text.trim()) {
          sent.push(result.text);
        }
        // 与生产一致：会话结束 hook 在正文之后触发
        if (result.sessionEnd) await pipeline.runSessionEndHooks(result.sessionEnd);
      },
    },
  });
  harness.pipeline = pipeline;
  return harness;
}

let userSeq = 0;
/** 每个用例使用独立用户，避免共享 DB 中的历史消息串扰 */
function msg(text: string, userId?: string): IncomingMessage {
  const user = userId ?? "u1@im.wechat";
  return {
    channelId: "weixin-main",
    platform: "weixin",
    conversationId: user,
    senderId: user,
    text,
    receivedAt: Date.now(),
  };
}
function freshUser(): string {
  userSeq++;
  return `it-user${userSeq}@im.wechat`;
}

afterAll(async () => {
  closeDb();
  await Bun.sleep(100);
  try {
    rmSync(tmpState, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {
    // Windows 上 WAL 文件可能仍被 OS 持有，临时目录交由系统清理
  }
});

describe("端到端集成：Stage 1-5", () => {
  it("完整链路：过滤 → 路由 → systemPrompt → 流式发送 → sessionEnd 通知 → 消息持久化", async () => {
    // agent 输出 25 字符：首轮 update 达 10 字符冲刷一次，finalize 冲刷剩余
    const h = makeHarness(["aaaaa", "bbbbb", "ccccc", "ddddd", "eeeee"]);
    await h.pipeline.run(msg("给我讲个故事"));

    // 路由到默认 agent，首轮注入 systemPrompt
    expect(h.agent.prompts).toHaveLength(1);
    expect(h.agent.prompts[0]).toContain("给我讲个故事");
    expect(h.agent.prompts[0]!.length).toBeGreaterThan("给我讲个故事".length); // systemPrompt 被前置

    // 渠道收到：流式增量（合并了完整全文） + 会话结束通知
    const story = "aaaaabbbbbcccccdddddeeeee";
    const streamed = h.sent.filter((s) => !s.startsWith("[会话结束]"));
    expect(streamed.join("")).toBe(story);
    expect(streamed.length).toBeGreaterThanOrEqual(2); // 至少一次策略冲刷 + finalize

    // session-notify（notifyPolicy=own, ownedByBridge=true）发出通知
    const notify = h.sent.find((s) => s.startsWith("[会话结束]"));
    expect(notify).toBeDefined();
    expect(notify).toContain("agent=opencode");
    expect(notify).toContain("结果=completed");

    // SQLite 持久化 user + assistant 消息
    const db = (await import("@yoyojcoder-weixin-ai/core")).getDb();
    const rows = db
      .prepare("SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC")
      .all("u1@im.wechat:opencode") as Array<{ role: string; content: string }>;
    expect(rows).toEqual([
      { role: "user", content: "给我讲个故事" },
      { role: "assistant", content: story },
    ]);

    // sessions 表有记录且 updated_at 被刷新（/api/sessions 依赖）
    const sessions = h.sessionMgr.list().filter((s) => s.id === "u1@im.wechat:opencode");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.messageCount).toBe(2);
  });

  it("非流式渠道：不发增量，Stage 5 整段发送", async () => {
    const user = freshUser();
    const h = makeHarness(["aaaaa", "bbbbb", "完整回复"], [user], false);
    await h.pipeline.run(msg("你好", user));

    // 无流式增量，Stage 5 发送整段（含 session-notify 通知）
    expect(h.sent[0]).toBe("aaaaabbbbb完整回复");
    expect(h.sent.some((s) => s.startsWith("[会话结束]"))).toBe(true);
  });

  it("第二轮对话：不再注入 systemPrompt，历史累积", async () => {
    const user = freshUser();
    const h = makeHarness(["好的"], [user]);
    // 同一 harness 跑两轮：第一轮建立历史
    await h.pipeline.run(msg("第一轮问题", user));
    await h.pipeline.run(msg("第二轮问题", user));

    expect(h.agent.prompts).toHaveLength(2);
    // 第一轮带 systemPrompt，第二轮不带
    expect(h.agent.prompts[0]).not.toBe("第一轮问题");
    expect(h.agent.prompts[1]).toBe("第二轮问题");
  });

  it("桥重启后（ACP session 重建）：重新注入 systemPrompt", async () => {
    const user = freshUser();
    // 第一个 harness 跑一轮，DB 留下历史
    const h1 = makeHarness(["好的"], [user]);
    await h1.pipeline.run(msg("重启前的问题", user));
    expect(h1.agent.prompts[0]).not.toBe("重启前的问题"); // 已注入

    // 新 harness = 桥重启（agentSessions 清空），但 DB 历史仍在
    const h2 = makeHarness(["好的"], [user]);
    await h2.pipeline.run(msg("重启后的问题", user));
    // ACP session 是新的 → 必须重新注入 systemPrompt
    expect(h2.agent.prompts[0]).not.toBe("重启后的问题");
    expect(h2.agent.prompts[0]).toContain("重启后的问题");
  });

  it("message-filter 插件截断超长消息", async () => {
    const user = freshUser();
    const h = makeHarness(["ok"], [user]);
    const longText = "x".repeat(6000);
    await h.pipeline.run(msg(longText, user));

    // agent 收到的 prompt 中用户部分已被截断到 5000
    const prompt = h.agent.prompts[0]!;
    expect(prompt.length).toBeLessThan(6000);
    expect(prompt).toContain("x".repeat(100)); // 内容仍在
  });

  it("非白名单用户被路由拒绝", async () => {
    const h = makeHarness(["ok"]);
    await expect(
      h.pipeline.run(msg("hi", "stranger@im.wechat")),
    ).rejects.toThrow();
  });
});
