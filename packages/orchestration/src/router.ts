import type { ParsedMessage, RoutedMessage, BridgeConfig } from "@yoyojcoder-weixin-ai/core";
import type { AccessStore } from "./access-manager.ts";

const AGENT_PREFIXES: Record<string, string> = {
  "/oc": "opencode",
  "/cc": "claude",
  "/cx": "codex",
};

export class Router {
  private userBinding = new Map<string, string>();

  constructor(
    private config: BridgeConfig,
    private access?: AccessStore,
    /** channelId → 渠道账号本人（登录用户）ID；其消息默认已授权 */
    private owners: ReadonlyMap<string, string> = new Map(),
  ) {}

  parseRoute(msg: ParsedMessage): RoutedMessage {
    this.assertAllowed(msg);
    const { agentId, text } = this.parsePrefix(msg);
    return {
      message: { ...msg, text },
      agentId,
      sessionId: this.getSessionId(msg, agentId),
    };
  }

  assertAllowed(msg: ParsedMessage): void {
    const accessKey = this.getAccessKey(msg);
    if (!this.isAllowed(msg, accessKey)) {
      throw new Error(`非白名单用户 ${accessKey}`);
    }
  }

  private isAllowed(msg: ParsedMessage, accessKey: string): boolean {
    // 登录账号本人（扫码的那个微信号）默认授权：本机即持有凭据，无需再审批；
    // 但本机显式 revoke 仍然生效，避免“撤销了却没拦住”。
    if (this.isOwner(msg)) {
      return this.access?.getStatus(accessKey) !== "revoked";
    }

    if (this.config.allowFrom.length > 0) {
      return this.config.allowFrom.includes(accessKey) || (
        msg.channelId === "weixin-main" && this.config.allowFrom.includes(msg.senderId)
      );
    }

    const status = this.access?.getStatus(accessKey);
    if (status === "approved") {
      return true;
    }

    if (status === undefined) {
      this.access?.recordPending(accessKey);
      console.warn(
        `[router] 已记录待审批用户 ${accessKey}；运行 wah access approve ${accessKey} 后方可使用。`,
      );
    }
    return false;
  }

  private isOwner(msg: ParsedMessage): boolean {
    const owner = this.owners.get(msg.channelId);
    return !!owner && owner === msg.senderId;
  }

  private parsePrefix(msg: ParsedMessage): { agentId: string; text: string } {
    for (const [prefix, agentId] of Object.entries(AGENT_PREFIXES)) {
      if (
        msg.text === prefix ||
        msg.text.startsWith(prefix + " ") ||
        msg.text.startsWith(prefix + "\n")
      ) {
        this.userBinding.set(this.getBindingKey(msg), agentId);
        return { agentId, text: msg.text.slice(prefix.length).trim() };
      }
    }
    const bound = this.userBinding.get(this.getBindingKey(msg)) ?? this.config.defaultAgent;
    return { agentId: bound, text: msg.text.trim() };
  }

  private getBindingKey(msg: ParsedMessage): string {
    return `${msg.channelId}:${msg.senderId}`;
  }

  private getAccessKey(msg: ParsedMessage): string {
    // Preserve approvals created before multi-channel support.
    return msg.channelId === "weixin-main"
      ? msg.senderId
      : `${msg.channelId}:${msg.senderId}`;
  }

  private getSessionId(msg: ParsedMessage, agentId: string): string {
    // Preserve existing WeChat session/history keys; namespace every new channel.
    return msg.channelId === "weixin-main"
      ? `${msg.senderId}:${agentId}`
      : `${msg.channelId}:${msg.conversationId}:${agentId}`;
  }
}
