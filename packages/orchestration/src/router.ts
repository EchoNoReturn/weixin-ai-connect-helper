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
  ) {}

  parseRoute(msg: ParsedMessage): RoutedMessage {
    const accessKey = this.getAccessKey(msg);
    if (!this.isAllowed(msg, accessKey)) {
      throw new Error(`非白名单用户 ${accessKey}`);
    }

    const { agentId, text } = this.parsePrefix(msg);
    return {
      message: { ...msg, text },
      agentId,
      sessionId: this.getSessionId(msg, agentId),
    };
  }

  private isAllowed(msg: ParsedMessage, accessKey: string): boolean {
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
