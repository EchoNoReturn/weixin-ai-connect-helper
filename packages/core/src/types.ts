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
}

export interface SessionEndContext {
  agentId: string;
  sessionId: string;
  ownedByBridge: boolean;
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
