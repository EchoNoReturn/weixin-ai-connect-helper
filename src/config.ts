import type { BridgeConfig } from "@yoyojcoder-weixin-ai/core";

const DEFAULTS: BridgeConfig = {
  allowFrom: [],
  defaultAgent: "opencode",
  agents: {
    opencode: {
      command: "opencode",
      args: ["acp"],
      cwd: process.cwd(),
      notifyPolicy: "none",
    },
  },
  autoApprove: true,
  webPort: 3210,
  pluginsFile: "plugins.json",
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
