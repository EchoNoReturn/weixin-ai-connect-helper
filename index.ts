// 入口：微信登录 → 长轮询收消息 → 路由 → ACP agent → 回复流式发回微信
// 架构见 DESIGN.md

import "./src/env.ts"; // 必须最先导入：重定向 OPENCLAW_STATE_DIR
import { loadConfig } from "./src/config.ts";
import { ensureWeixinLogin } from "./src/weixin/login.ts";
import { runInboundLoop } from "./src/weixin/inbound.ts";
import { WeixinOutbound } from "./src/weixin/outbound.ts";
import { Router } from "./src/router.ts";

const config = await loadConfig();
console.log(
  `[bridge] 配置就绪: defaultAgent=${config.defaultAgent} ` +
    `agents=[${Object.keys(config.agents).join(", ")}] ` +
    `autoApprove=${config.autoApprove} allowFrom=${config.allowFrom.length} 人`,
);

const creds = await ensureWeixinLogin();
const outbound = new WeixinOutbound(creds);
const router = new Router(config, outbound);

const abort = new AbortController();
async function shutdown() {
  console.log("\n[bridge] 正在停止...");
  abort.abort();
  await router.dispose();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

console.log("[bridge] 桥已启动，等待微信消息...");
await runInboundLoop({
  creds,
  abortSignal: abort.signal,
  onMessage: async (msg) => {
    outbound.noteContextToken(msg.fromUserId, msg.contextToken);
    console.log(`[weixin] 收到 ${msg.fromUserId}: ${msg.text.slice(0, 80)}`);
    await router.handle(msg);
  },
});
