import { readHealth, isRunning, readPid } from "../daemon.ts";

export async function execStatus(): Promise<void> {
  const pkg = JSON.parse(await Bun.file("package.json").text());

  console.log("=== weixin-ai-connect-helper ===\n");
  console.log(`版本:        ${pkg.version}`);

  if (await isRunning()) {
    const pid = await readPid();
    const health = await readHealth();
    console.log(`进程状态:    运行中 (PID: ${pid})`);

    if (health) {
      const statusMap: Record<string, string> = {
        connected: "✅ 已连接",
        reconnecting: "⚠️ 重连中",
        starting: "⏳ 启动中",
        stopped: "❌ 已停止",
      };
      console.log(`连接状态:    ${statusMap[health.status] ?? health.status}`);
      console.log(`微信账号:    ${health.accountId ?? "未知"}`);

      if (health.lastMessageAt) {
        const ago = Math.round((Date.now() - health.lastMessageAt) / 1000);
        console.log(`最后消息:    ${ago}s 前`);
      }

      if (health.reconnectAttempts > 0) {
        console.log(`重连次数:    ${health.reconnectAttempts}`);
      }

      if (health.lastError) {
        console.log(`最后错误:    ${health.lastError}`);
      }

      const uptime = Math.round((Date.now() - health.startedAt) / 1000);
      const m = Math.floor(uptime / 60);
      const s = uptime % 60;
      console.log(`运行时长:    ${m > 0 ? `${m}m` : ""}${s}s`);
    }
  } else {
    console.log(`进程状态:    未运行`);
  }

  console.log("");
}
