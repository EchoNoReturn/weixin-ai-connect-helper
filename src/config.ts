import type { BridgeConfig } from "@yoyojcoder-weixin-ai/core";
import { getConfigPath } from "./bin-dir.ts";
import path from "node:path";
import { validateBridgeConfig } from "./config-validation.ts";

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
  autoApprove: false,
  webPort: 5173,
  pluginsFile: "plugins.json",
  streamFlushMinChars: 200,
  streamFlushIdleMs: 3000,
  channels: [{ type: "weixin", id: "weixin-main", enabled: true }],
};

export async function loadConfig(): Promise<BridgeConfig> {
  const configPath = path.resolve(getConfigPath("bridge.config.json"));
  const file = Bun.file(configPath);
  if (!(await file.exists())) {
    const config = {
      ...DEFAULTS,
      agents: { ...DEFAULTS.agents },
      channels: DEFAULTS.channels.map((channel) => ({ ...channel })),
      pluginsFile: path.resolve(getConfigPath(DEFAULTS.pluginsFile)),
    };
    validateBridgeConfig(config);
    return config;
  }
  try {
    const raw = (await file.json()) as Partial<BridgeConfig>;
    const merged = {
      ...DEFAULTS,
      ...raw,
      agents: { ...DEFAULTS.agents, ...(raw.agents ?? {}) },
      channels: raw.channels ?? DEFAULTS.channels.map((channel) => ({ ...channel })),
    };
    const config = {
      ...merged,
      pluginsFile: path.isAbsolute(merged.pluginsFile)
        ? merged.pluginsFile
        : path.resolve(path.dirname(configPath), merged.pluginsFile),
    };
    validateBridgeConfig(config);
    return config;
  } catch (err) {
    throw new Error(`[config] 无法解析 ${configPath}: ${String(err)}`);
  }
}
