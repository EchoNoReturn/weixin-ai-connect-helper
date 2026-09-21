// API 客户端（DESIGN §4.3）

export interface BridgeHealth {
  status: "starting" | "connected" | "reconnecting" | "stopped";
  accountId?: string;
  lastMessageAt?: number;
  lastError?: string;
  reconnectAttempts: number;
  startedAt: number;
}

export interface StatusResponse {
  version: string;
  bridge: BridgeHealth | { status: "stopped" };
  now: number;
}

export interface AgentInfo {
  id: string;
  command: string;
  args: string[];
  cwd: string;
  notifyPolicy: "none" | "own" | "all";
  isDefault: boolean;
}

export interface SessionItem {
  id: string;
  userId: string;
  agentId: string;
  ownedByBridge: boolean;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface SessionMessage {
  id: number;
  role: string;
  content: string;
  createdAt: number;
}

export interface PluginInfo {
  name: string;
  enabled: boolean;
  entry: string;
  hooks: string[];
}

export interface LogEntry {
  ts: string;
  level: "debug" | "info" | "warn" | "error";
  scope: string;
  msg: string;
}

export type BridgeConfig = Record<string, unknown>;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  status: () => req<StatusResponse>("/api/status"),
  getConfig: () => req<BridgeConfig>("/api/config"),
  putConfig: (patch: BridgeConfig) =>
    req<{ config: BridgeConfig; restartRequired: boolean }>("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  agents: () => req<{ defaultAgent: string; agents: AgentInfo[] }>("/api/agents"),
  addAgent: (a: { id: string; command: string; args?: string[]; cwd?: string; notifyPolicy?: string }) =>
    req<{ id: string }>("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(a),
    }),
  updateAgent: (id: string, patch: Partial<AgentInfo>) =>
    req<{ id: string }>(`/api/agents/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  deleteAgent: (id: string) =>
    req<{ deleted: string }>(`/api/agents/${encodeURIComponent(id)}`, { method: "DELETE" }),
  sessions: () => req<{ sessions: SessionItem[] }>("/api/sessions"),
  sessionMessages: (id: string, limit = 100) =>
    req<{ messages: SessionMessage[] }>(
      `/api/sessions/${encodeURIComponent(id)}/messages?limit=${limit}`,
    ),
  plugins: () => req<{ plugins: PluginInfo[] }>("/api/plugins"),
  togglePlugin: (name: string, enabled: boolean) =>
    req<{ name: string; enabled: boolean }>(`/api/plugins/${encodeURIComponent(name)}/toggle`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }),
};

export function connectLogs(onEntry: (entry: LogEntry, isReplay: boolean) => void): () => void {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/api/logs`);
  ws.onmessage = (ev) => {
    const { type, entry } = JSON.parse(String(ev.data)) as { type: string; entry: LogEntry };
    onEntry(entry, type === "replay");
  };
  return () => ws.close();
}
