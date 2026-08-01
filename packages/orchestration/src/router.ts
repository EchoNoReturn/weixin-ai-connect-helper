import type { ParsedMessage, RoutedMessage, BridgeConfig } from "@yoyojcoder-weixin-ai/core";

const AGENT_PREFIXES: Record<string, string> = {
  "/oc": "opencode",
  "/cc": "claude",
  "/cx": "codex",
};

export class Router {
  private userBinding = new Map<string, string>();
  private autoBoundOwner: string | null = null;

  constructor(private config: BridgeConfig) {}

  parseRoute(msg: ParsedMessage): RoutedMessage {
    if (!this.isAllowed(msg.fromUserId)) {
      throw new Error(`非白名单用户 ${msg.fromUserId}`);
    }

    const { agentId, text } = this.parsePrefix(msg);
    return {
      message: { ...msg, text },
      agentId,
      sessionId: `${msg.fromUserId}:${agentId}`,
    };
  }

  private isAllowed(userId: string): boolean {
    if (this.config.allowFrom.length > 0) {
      return this.config.allowFrom.includes(userId);
    }
    if (!this.autoBoundOwner) {
      this.autoBoundOwner = userId;
      console.warn(
        `[router] allowFrom 为空，已自动绑定首个用户 ${userId}；其余用户将被忽略。`,
      );
    }
    return userId === this.autoBoundOwner;
  }

  private parsePrefix(msg: ParsedMessage): { agentId: string; text: string } {
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
}
