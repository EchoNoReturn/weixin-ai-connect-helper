export interface ParsedMessage {
  fromUserId: string;
  text: string;
  contextToken?: string;
  receivedAt: number;
}

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
  /** 通知策略（来自 agent 配置）：none=不通知 own=仅本桥接创建的会话 all=所有会话 */
  notifyPolicy: "none" | "own" | "all";
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

export interface BridgeConfig {
  allowFrom: string[];
  defaultAgent: string;
  agents: Record<string, AgentConfig>;
  autoApprove: boolean;
  webPort: number;
  pluginsFile: string;
  streamFlushMinChars: number;
  streamFlushIdleMs: number;
}
