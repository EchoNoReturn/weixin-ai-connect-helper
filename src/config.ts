import type { BridgeConfig } from "@yoyojcoder-weixin-ai/core";
import { getConfigPath } from "./bin-dir.ts";

export type { BridgeConfig };

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
  webPort: 5173,
  pluginsFile: "plugins.json",
  streamFlushMinChars: 200,
  streamFlushIdleMs: 3000,
};

/** 持久化配置到 bridge.config.json */
export async function saveConfig(config: BridgeConfig): Promise<BridgeConfig> {
  const configPath = getConfigPath("bridge.config.json");
  await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");
  return config;
}

export async function loadConfig(): Promise<BridgeConfig> {
  const configPath = getConfigPath("bridge.config.json");
  const file = Bun.file(configPath);
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
