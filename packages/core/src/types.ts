import type { IncomingMessage } from "./channel.ts";

/** @deprecated Use IncomingMessage; kept as a source-compatible plugin type name. */
export type ParsedMessage = IncomingMessage;

export interface RoutedMessage {
  message: ParsedMessage;
  agentId: string;
  sessionId: string;
  acpSessionId?: string;
}

export interface PromptContext {
  routed: RoutedMessage;
  systemPrompt: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  prompt: string;
}

export interface AgentResult {
  ctx: PromptContext;
  text: string;
  stopReason: string;
  durationMs: number;
  /**
   * 回复是否已在 Stage 4 经流式增量完整发出（streaming 渠道）。
   * 为 true 时 Stage 5 不再重复发送正文（beforeSend 的修改也不会再送达）。
   */
  streamed?: boolean;
  /**
   * 本轮会话结束上下文，由 Stage 4 构建、Stage 5 发送完成后触发 onSessionEnd。
   * 挂在 result 上是为了保证非流式渠道的通知排在回复正文之后。
   */
  sessionEnd?: SessionEndContext;
}

export interface SessionEndContext {
  agentId: string;
  sessionId: string;
  ownedByBridge: boolean;
  /** 通知策略（来自 agent 配置）：none=不通知 own=仅本桥接创建的会话 all=所有会话 */
  notifyPolicy?: "none" | "own" | "all";
  lastMessage?: string;
  durationMs: number;
  stopReason: string;
  notify: (text: string) => Promise<void>;
}

export interface AgentConfig {
  command: string;
  args: string[];
  cwd: string;
  notifyPolicy?: "none" | "own" | "all";
}

export interface WeixinChannelConfig {
  type: "weixin";
  id?: string;
  enabled?: boolean;
}

export interface WebhookChannelConfig {
  type: "webhook";
  id?: string;
  enabled?: boolean;
  hostname?: string;
  port?: number;
  /** Name of the environment variable containing the bearer token. */
  tokenEnv?: string;
}

export type ChannelConfig = WeixinChannelConfig | WebhookChannelConfig;

export interface BridgeConfig {
  allowFrom: string[];
  defaultAgent: string;
  agents: Record<string, AgentConfig>;
  autoApprove: boolean;
  webPort: number;
  pluginsFile: string;
  streamFlushMinChars: number;
  streamFlushIdleMs: number;
  channels: ChannelConfig[];
}
