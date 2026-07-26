import { ensureWeixinLogin } from "@yoyojcoder-weixin-ai/transport";
import { createLogger } from "@yoyojcoder-weixin-ai/core";

export async function execLogin(): Promise<void> {
  const log = createLogger("login");
  log.info("启动微信扫码登录...");

  try {
    const creds = await ensureWeixinLogin();
    console.log(`\n✅ 登录成功: ${creds.accountId}\n`);
  } catch (err) {
    console.error(`\n❌ 登录失败: ${String(err)}\n`);
    process.exit(1);
  }
}
