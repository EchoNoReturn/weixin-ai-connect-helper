import type { BridgeConfig } from "./config.ts";
import { AcpAgent } from "./acp/agent.ts";
import type { InboundTextMessage } from "./weixin/inbound.ts";
import type { WeixinOutbound } from "./weixin/outbound.ts";

/** 消息前缀 → agentId：/oc=opencode /cc=claude /cx=codex */
const AGENT_PREFIXES: Record<string, string> = {
  "/oc": "opencode",
  "/cc": "claude",
  "/cx": "codex",
};

export class Router {
  /** agentId → 启动中的 agent（存 Promise 防并发重复 spawn） */
  private agents = new Map<string, Promise<AcpAgent>>();
  /** fromUserId → 当前绑定的 agentId */
  private userBinding = new Map<string, string>();
  /** allowFrom 为空时自动绑定的首个用户 */
  private autoBoundOwner: string | null = null;

  constructor(
    private config: BridgeConfig,
    private outbound: WeixinOutbound,
  ) {}

  async handle(msg: InboundTextMessage): Promise<void> {
    if (!this.isAllowed(msg.fromUserId)) {
      console.log(`[router] 忽略非白名单用户 ${msg.fromUserId}`);
      return;
    }

    const { agentId, text } = this.parseRoute(msg);
    if (!text) {
      await this.outbound.sendText(
        msg.fromUserId,
        `已切换到 ${agentId}，请继续发送任务。`,
      );
      return;
    }

    let agent: AcpAgent;
    try {
      agent = await this.getAgent(agentId);
    } catch (err) {
      await this.outbound.sendText(
        msg.fromUserId,
        `agent "${agentId}" 启动失败: ${String(err)}`,
      );
      return;
    }

    console.log(`[router] ${msg.fromUserId} → ${agentId}: ${text.slice(0, 80)}`);

    const coalescer = new StreamCoalescer(
      this.config.streamFlushMinChars,
      this.config.streamFlushIdleMs,
      (t) => this.outbound.sendText(msg.fromUserId, t),
    );

    try {
      const result = await agent.prompt(msg.fromUserId, text, (full) =>
        coalescer.update(full),
      );
      await coalescer.finish(result.text);
      if (!result.text.trim()) {
        await this.outbound.sendText(
          msg.fromUserId,
          `(agent 已完成，无文本输出；stopReason=${result.stopReason})`,
        );
      }
    } catch (err) {
      console.error(`[router] prompt 执行失败:`, err);
      await coalescer.finishNow();
      await this.outbound.sendText(msg.fromUserId, `执行出错: ${String(err)}`);
    }
  }

  private isAllowed(userId: string): boolean {
    if (this.config.allowFrom.length > 0) {
      return this.config.allowFrom.includes(userId);
    }
    if (!this.autoBoundOwner) {
      this.autoBoundOwner = userId;
      console.warn(
        `[router] allowFrom 为空，已自动绑定首个用户 ${userId}；` +
          `其余用户将被忽略。建议在 bridge.config.json 中配置 allowFrom。`,
      );
    }
    return userId === this.autoBoundOwner;
  }

  private parseRoute(msg: InboundTextMessage): { agentId: string; text: string } {
    for (const [prefix, agentId] of Object.entries(AGENT_PREFIXES)) {
      if (
        msg.text === prefix ||
        msg.text.startsWith(prefix + " ") ||
        msg.text.startsWith(prefix + "\n")
      ) {
        this.userBinding.set(msg.fromUserId, agentId);
        return { agentId, text: msg.text.slice(prefix.length).trim() };
      }
    }
    const bound = this.userBinding.get(msg.fromUserId) ?? this.config.defaultAgent;
    return { agentId: bound, text: msg.text.trim() };
  }

  private getAgent(agentId: string): Promise<AcpAgent> {
    let pending = this.agents.get(agentId);
    if (!pending) {
      const cfg = this.config.agents[agentId];
      if (!cfg) {
        throw new Error(`未知 agent "${agentId}"（未在 agents 中配置）`);
      }
      pending = AcpAgent.start(agentId, cfg, {
        autoApprove: this.config.autoApprove,
      });
      this.agents.set(agentId, pending);
      pending.catch(() => this.agents.delete(agentId)); // 启动失败允许重试
    }
    return pending;
  }

  async dispose(): Promise<void> {
    for (const pending of this.agents.values()) {
      const agent = await pending.catch(() => null);
      await agent?.dispose();
    }
    this.agents.clear();
  }
}

/**
 * 流式合并器（借鉴原插件 blockStreaming 策略，DESIGN.md §4.4）：
 * 缓冲满 minChars 且距上次发送 idleMs 时冲刷增量；finish 时冲刷剩余。
 */
class StreamCoalescer {
  private flushed = 0;
  private latest = "";
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private minChars: number,
    private idleMs: number,
    private send: (text: string) => Promise<void>,
  ) {}

  update(fullText: string): void {
    this.latest = fullText;
    if (fullText.length - this.flushed < this.minChars) return;
    if (this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flushDelta();
    }, this.idleMs);
  }

  /** prompt 正常结束：冲刷剩余文本 */
  async finish(fullText: string): Promise<void> {
    this.latest = fullText;
    await this.finishNow();
  }

  /** 立即冲刷剩余文本（结束或出错时调用） */
  async finishNow(): Promise<void> {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    await this.flushDelta();
  }

  private async flushDelta(): Promise<void> {
    const delta = this.latest.slice(this.flushed);
    if (!delta.trim()) return;
    this.flushed = this.latest.length;
    try {
      await this.send(delta);
    } catch (err) {
      console.error("[coalescer] 发送失败:", err);
    }
  }
}
