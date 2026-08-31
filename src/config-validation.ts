import type { BridgeConfig } from "@yoyojcoder-weixin-ai/core";

export function validateBridgeConfig(value: unknown): asserts value is BridgeConfig {
  if (!isRecord(value)) fail("配置必须是对象");
  if (!Array.isArray(value.allowFrom) || !value.allowFrom.every((item) => typeof item === "string")) fail("allowFrom 必须是字符串数组");
  if (typeof value.defaultAgent !== "string" || !value.defaultAgent) fail("defaultAgent 必须是非空字符串");
  if (!isRecord(value.agents) || Object.keys(value.agents).length === 0) fail("agents 必须是非空对象");
  for (const [id, agent] of Object.entries(value.agents)) {
    if (!isRecord(agent) || typeof agent.command !== "string" || !Array.isArray(agent.args) || !agent.args.every((arg) => typeof arg === "string") || typeof agent.cwd !== "string") {
      fail(`agents.${id} 的 command/args/cwd 无效`);
    }
  }
  if (!(value.defaultAgent in value.agents)) fail(`defaultAgent "${value.defaultAgent}" 未在 agents 中定义`);
  if (typeof value.autoApprove !== "boolean") fail("autoApprove 必须是布尔值");
  for (const key of ["webPort", "streamFlushMinChars", "streamFlushIdleMs"] as const) {
    if (!Number.isInteger(value[key]) || (value[key] as number) < 0) fail(`${key} 必须是非负整数`);
  }
  if (typeof value.pluginsFile !== "string" || !value.pluginsFile) fail("pluginsFile 必须是非空字符串");
  if (!Array.isArray(value.channels) || value.channels.length === 0) fail("channels 必须是非空数组");
  const ids = new Set<string>();
  let enabled = 0;
  for (const [index, channel] of value.channels.entries()) {
    if (!isRecord(channel) || (channel.type !== "weixin" && channel.type !== "webhook")) fail(`channels[${index}].type 不受支持`);
    const id = typeof channel.id === "string" && channel.id ? channel.id : `${channel.type}-main`;
    if (ids.has(id)) fail(`渠道 ID 重复: ${id}`);
    ids.add(id);
    if (channel.enabled !== false) enabled++;
    if (channel.enabled !== undefined && typeof channel.enabled !== "boolean") fail(`channels[${index}].enabled 必须是布尔值`);
    if (channel.type === "webhook") {
      if (channel.port !== undefined && (!Number.isInteger(channel.port) || (channel.port as number) < 0 || (channel.port as number) > 65535)) fail(`channels[${index}].port 无效`);
      for (const key of ["hostname", "tokenEnv"] as const) {
        if (channel[key] !== undefined && typeof channel[key] !== "string") fail(`channels[${index}].${key} 必须是字符串`);
      }
    }
  }
  if (enabled === 0) fail("至少需要启用一个渠道");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(`[config] ${message}`);
}
