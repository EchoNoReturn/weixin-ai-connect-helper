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
  webPort: 3210,
  pluginsFile: "plugins.json",
  streamFlushMinChars: 200,
  streamFlushIdleMs: 3000,
  channels: [{ type: "weixin", id: "weixin-main", enabled: true }],
};

/**
 * 持久化配置到 bridge.config.json（Web 控制台 /api/config、/api/agents 使用）。
 * pluginsFile 相对配置目录可表达时写回相对路径，避免把开发机的绝对路径写进配置。
 */
export async function saveConfig(config: BridgeConfig): Promise<BridgeConfig> {
  validateBridgeConfig(config);
  const configPath = path.resolve(getConfigPath("bridge.config.json"));
  const configDir = path.dirname(configPath);
  const pluginsFile = path.isAbsolute(config.pluginsFile)
    && path.resolve(config.pluginsFile).startsWith(configDir + path.sep)
    ? path.relative(configDir, config.pluginsFile)
    : config.pluginsFile;
  await Bun.write(configPath, JSON.stringify({ ...config, pluginsFile }, null, 2) + "\n");
  return config;
}

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
