import type { PromptContext, AgentResult, SessionEndContext, AgentConfig } from "@yoyojcoder-weixin-ai/core";
import { StreamCoalescer } from "@yoyojcoder-weixin-ai/agent";
import { composePrompt } from "@yoyojcoder-weixin-ai/orchestration";

/**
 * runAgentTurn — Stage 4 执行单元（DESIGN §2 Stage 4）
 *
 * 职责：
 *  1. composePrompt 拼接最终 prompt（agent 侧新会话时注入 systemPrompt）
 *  2. 调 agent.prompt，onChunk 经 StreamCoalescer 按策略流式发微信
 *  3. prompt 结束 finalize 冲刷剩余文本
 *  4. 持久化 user/assistant 消息
 *  5. 触发 onSessionEnd（携带 notifyPolicy / ownedByBridge）
 *
 * 所有副作用依赖均注入，可独立单测。
 */

export interface AgentLike {
  prompt(sessionId: string, text: string, onChunk: (fullText: string) => void): Promise<{ text: string; stopReason: string }>;
}

export interface SessionStoreLike {
  saveMessage(sessionId: string, role: "user" | "assistant", content: string): void;
  get(sessionId: string): { ownedByBridge: boolean } | undefined;
}

export interface AgentTurnDeps {
  agent: AgentLike;
  agentConfig: AgentConfig;
  sendDelta: (userId: string, delta: string) => Promise<void>;
  sessionStore: SessionStoreLike;
  onSessionEnd: (ctx: SessionEndContext) => Promise<void>;
  streamFlushMinChars: number;
  streamFlushIdleMs: number;
  /**
   * agent 侧 ACP session 是否为新建（本进程内尚无该会话）。
   * 为 true 时 composePrompt 注入 systemPrompt；桥重启后 ACP session 重建，
   * 即使 DB 有历史也必须为 true。
   */
  isNewAgentSession: boolean;
  /** 时钟注入（测试用） */
  now?: () => number;
}

export async function runAgentTurn(ctx: PromptContext, deps: AgentTurnDeps): Promise<AgentResult> {
  const userId = ctx.routed.message.fromUserId;
  const sessionId = ctx.routed.sessionId;
  const startTime = (deps.now ?? Date.now)();

  const coalescer = new StreamCoalescer({
    minChars: deps.streamFlushMinChars,
    idleMs: deps.streamFlushIdleMs,
    now: deps.now,
    flush: (delta) => deps.sendDelta(userId, delta),
  });

  const finalPrompt = composePrompt(ctx, deps.isNewAgentSession);
  deps.sessionStore.saveMessage(sessionId, "user", ctx.prompt);

  // onChunk 是同步回调；内部异步冲刷串行化，避免并发发送乱序
  let flushQueue: Promise<void> = Promise.resolve();
  const result = await deps.agent.prompt(sessionId, finalPrompt, (full) => {
    flushQueue = flushQueue.then(() => coalescer.update(full));
  });
  // 等所有排队的冲刷完成后，再冲刷剩余文本
  await flushQueue;
  await coalescer.finalize(result.text);

  deps.sessionStore.saveMessage(sessionId, "assistant", result.text);

  const durationMs = (deps.now ?? Date.now)() - startTime;
  const record = deps.sessionStore.get(sessionId);

  await deps.onSessionEnd({
    agentId: ctx.routed.agentId,
    sessionId,
    ownedByBridge: record?.ownedByBridge ?? true,
    notifyPolicy: deps.agentConfig.notifyPolicy ?? "none",
    lastMessage: result.text,
    durationMs,
    stopReason: result.stopReason,
    notify: (text) => deps.sendDelta(userId, text),
  });

  return {
    ctx,
    text: result.text,
    stopReason: result.stopReason,
    durationMs,
  };
}
