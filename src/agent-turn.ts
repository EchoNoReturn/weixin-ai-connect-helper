import type { PromptContext, AgentResult, AgentConfig } from "@yoyojcoder-weixin-ai/core";
import { StreamCoalescer } from "@yoyojcoder-weixin-ai/agent";
import { composePrompt } from "@yoyojcoder-weixin-ai/orchestration";

/**
 * runAgentTurn — Stage 4 执行单元（DESIGN §2 Stage 4）
 *
 * 职责：
 *  1. composePrompt 拼接最终 prompt（agent 侧新会话时注入 systemPrompt）
 *  2. 调 agent.prompt；streaming 渠道经 StreamCoalescer 按策略流式发送增量
 *     （非 streaming 渠道不发增量，整段回复由 Stage 5 发送）
 *  3. 持久化 user/assistant 消息
 *  4. 构建 SessionEndContext 挂在 AgentResult.sessionEnd 上，
 *     由 Stage 5 发送完成后触发 onSessionEnd（保证通知排在正文之后）
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
  /** 渠道是否支持流式（capabilities.streaming）；false 时不发任何增量 */
  streaming: boolean;
  /** 流式增量发送（仅 streaming=true 时被调用） */
  sendDelta: (delta: string) => Promise<void>;
  /** 整段文本发送（onSessionEnd 的 notify 等场景，与流式能力无关） */
  sendText: (text: string) => Promise<void>;
  sessionStore: SessionStoreLike;
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
  const sessionId = ctx.routed.sessionId;
  const startTime = (deps.now ?? Date.now)();

  const coalescer = new StreamCoalescer({
    minChars: deps.streamFlushMinChars,
    idleMs: deps.streamFlushIdleMs,
    now: deps.now,
    flush: (delta) => deps.sendDelta(delta),
  });

  const finalPrompt = composePrompt(ctx, deps.isNewAgentSession);
  deps.sessionStore.saveMessage(sessionId, "user", ctx.prompt);

  // onChunk 是同步回调；内部异步冲刷串行化，避免并发发送乱序
  let flushQueue: Promise<void> = Promise.resolve();
  const result = await deps.agent.prompt(sessionId, finalPrompt, (full) => {
    if (!deps.streaming) return;
    flushQueue = flushQueue.then(() => coalescer.update(full));
  });
  if (deps.streaming) {
    // 等所有排队的冲刷完成后，再冲刷剩余文本
    await flushQueue;
    await coalescer.finalize(result.text);
  }

  deps.sessionStore.saveMessage(sessionId, "assistant", result.text);

  const durationMs = (deps.now ?? Date.now)() - startTime;
  const record = deps.sessionStore.get(sessionId);

  return {
    ctx,
    text: result.text,
    stopReason: result.stopReason,
    durationMs,
    streamed: deps.streaming,
    sessionEnd: {
      agentId: ctx.routed.agentId,
      sessionId,
      ownedByBridge: record?.ownedByBridge ?? true,
      notifyPolicy: deps.agentConfig.notifyPolicy ?? "none",
      lastMessage: result.text,
      durationMs,
      stopReason: result.stopReason,
      notify: (text) => deps.sendText(text),
    },
  };
}
