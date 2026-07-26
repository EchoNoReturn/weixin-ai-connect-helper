export interface AgentConfig {
  /** 可执行命令，如 "opencode" / "claude-code-acp" / "codex-acp" */
  command: string;
  /** 启动参数，如 ["acp"] */
  args: string[];
  /** agent 的工作目录（session/new 的 cwd，agent 在此目录下操作文件） */
  cwd: string;
}

export interface BridgeConfig {
  /** 微信用户 ID 白名单（xxx@im.wechat）；为空时自动绑定首个发消息的用户 */
  allowFrom: string[];
  /** 无前缀消息的默认 agent */
  defaultAgent: string;
  agents: Record<string, AgentConfig>;
  /** PoC：自动批准 agent 的工具权限请求（DESIGN.md §4.5） */
  autoApprove: boolean;
  /** 流式合并：缓冲满 N 字符且距上次发送 M 毫秒时冲刷 */
  streamFlushMinChars: number;
  streamFlushIdleMs: number;
}

const DEFAULTS: BridgeConfig = {
  allowFrom: [],
  defaultAgent: "opencode",
  agents: {
    opencode: {
      command: "opencode",
      args: ["acp"],
      cwd: process.cwd(),
    },
  },
  autoApprove: true,
  streamFlushMinChars: 200,
  streamFlushIdleMs: 3000,
};

export async function loadConfig(): Promise<BridgeConfig> {
  const file = Bun.file("bridge.config.json");
  if (!(await file.exists())) {
    return DEFAULTS;
  }
  try {
    const raw = (await file.json()) as Partial<BridgeConfig>;
    return {
      ...DEFAULTS,
      ...raw,
      agents: { ...DEFAULTS.agents, ...(raw.agents ?? {}) },
    };
  } catch (err) {
    console.warn("[config] bridge.config.json 解析失败，使用默认配置:", err);
    return DEFAULTS;
  }
}
