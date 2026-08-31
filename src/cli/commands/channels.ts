import { loadConfig } from "../../config.ts";

export async function execChannelsList(): Promise<void> {
  const config = await loadConfig();
  console.log("状态\t类型\t渠道 ID\t监听地址");
  for (const channel of config.channels) {
    const id = channel.id ?? `${channel.type}-main`;
    const enabled = channel.enabled === false ? "disabled" : "enabled";
    const address = channel.type === "webhook"
      ? `${channel.hostname ?? "127.0.0.1"}:${channel.port ?? 3211}`
      : "-";
    console.log(`${enabled}\t${channel.type}\t${id}\t${address}`);
  }
  console.log("");
}
