import { describe, expect, test } from "bun:test";
import { validateBridgeConfig } from "../config-validation.ts";

const valid = {
  allowFrom: [], defaultAgent: "opencode",
  agents: { opencode: { command: "opencode", args: ["acp"], cwd: "." } },
  autoApprove: false, webPort: 3210, pluginsFile: "plugins.json",
  streamFlushMinChars: 200, streamFlushIdleMs: 3000,
  channels: [{ type: "weixin", id: "weixin-main" }],
};

describe("validateBridgeConfig", () => {
  test("accepts a valid config", () => expect(() => validateBridgeConfig(valid)).not.toThrow());
  test("rejects an unknown default agent", () => expect(() => validateBridgeConfig({ ...valid, defaultAgent: "missing" })).toThrow("未在 agents 中定义"));
  test("rejects duplicate normalized channel ids", () => expect(() => validateBridgeConfig({ ...valid, channels: [{ type: "webhook" }, { type: "webhook" }] })).toThrow("渠道 ID 重复"));
  test("rejects an invalid webhook port", () => expect(() => validateBridgeConfig({ ...valid, channels: [{ type: "webhook", port: 70000 }] })).toThrow("port 无效"));
});
