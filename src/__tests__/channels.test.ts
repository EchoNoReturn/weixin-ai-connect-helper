import { describe, expect, test } from "bun:test";
import type { BridgeConfig } from "@yoyojcoder-weixin-ai/core";
import { createChannelAdapters } from "../channels.ts";

function config(channels: BridgeConfig["channels"]): BridgeConfig {
  return {
    allowFrom: [],
    defaultAgent: "opencode",
    agents: { opencode: { command: "opencode", args: ["acp"], cwd: "." } },
    autoApprove: false,
    webPort: 3210,
    pluginsFile: "plugins.json",
    streamFlushMinChars: 200,
    streamFlushIdleMs: 3000,
    channels,
  };
}

describe("createChannelAdapters", () => {
  test("creates a webhook-only setup without requiring WeChat login", async () => {
    const adapters = await createChannelAdapters(config([
      { type: "webhook", id: "fallback", port: 0 },
    ]));
    expect(adapters.map(({ channelId, platform }) => ({ channelId, platform })))
      .toEqual([{ channelId: "fallback", platform: "webhook" }]);
  });

  test("rejects duplicate channel ids", async () => {
    await expect(createChannelAdapters(config([
      { type: "webhook", id: "same", port: 0 },
      { type: "webhook", id: "same", port: 0 },
    ]))).rejects.toThrow("重复的渠道 ID");
  });

  test("requires a configured token environment variable", async () => {
    await expect(createChannelAdapters(config([
      { type: "webhook", id: "external", hostname: "0.0.0.0", tokenEnv: "WAH_TEST_MISSING_TOKEN" },
    ]))).rejects.toThrow("缺少环境变量");
  });
});
