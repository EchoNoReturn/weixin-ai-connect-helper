import type { BridgeConfig, ChannelAdapter } from "@yoyojcoder-weixin-ai/core";
import {
  ensureWeixinLogin,
  LocalWebhookChannelAdapter,
  WeixinChannelAdapter,
} from "@yoyojcoder-weixin-ai/transport";

export async function createChannelAdapters(config: BridgeConfig): Promise<ChannelAdapter[]> {
  const adapters: ChannelAdapter[] = [];
  const ids = new Set<string>();

  for (const channel of config.channels) {
    if (channel.enabled === false) continue;
    const channelId = channel.id ?? `${channel.type}-main`;
    if (ids.has(channelId)) throw new Error(`重复的渠道 ID: ${channelId}`);
    ids.add(channelId);

    switch (channel.type) {
      case "weixin": {
        const creds = await ensureWeixinLogin();
        adapters.push(new WeixinChannelAdapter(creds, { channelId }));
        break;
      }
      case "webhook": {
        const token = channel.tokenEnv
          ? process.env[channel.tokenEnv]?.trim()
          : undefined;
        if (channel.tokenEnv && !token) {
          throw new Error(`Webhook 渠道 ${channelId} 缺少环境变量 ${channel.tokenEnv}`);
        }
        adapters.push(new LocalWebhookChannelAdapter({
          channelId,
          hostname: channel.hostname,
          port: channel.port,
          token,
        }));
        break;
      }
    }
  }

  if (adapters.length === 0) throw new Error("至少需要启用一个消息渠道");
  return adapters;
}
