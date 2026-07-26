import {
  DEFAULT_BASE_URL,
  DEFAULT_ILINK_BOT_TYPE,
  displayQRCode,
  listIndexedWeixinAccountIds,
  loadWeixinAccount,
  normalizeAccountId,
  registerWeixinAccountId,
  saveWeixinAccount,
  startWeixinLoginWithQr,
  waitForWeixinLogin,
} from "./api.ts";

export interface WeixinCredentials {
  /** 规范化后的 bot 账号 ID，如 "b0f5860fdecb-im-bot" */
  accountId: string;
  token: string;
  baseUrl: string;
}

const LOGIN_TIMEOUT_MS = 480_000; // 8 分钟扫码窗口，对齐原插件

/**
 * 确保微信侧已登录：优先复用已保存的账号，否则走终端扫码流程。
 */
export async function ensureWeixinLogin(): Promise<WeixinCredentials> {
  const existingId = listIndexedWeixinAccountIds()[0];
  if (existingId) {
    const acc = loadWeixinAccount(existingId);
    if (acc?.token) {
      console.log(`[weixin] 使用已登录账号 ${existingId}`);
      return {
        accountId: existingId,
        token: acc.token,
        baseUrl: acc.baseUrl?.trim() || DEFAULT_BASE_URL,
      };
    }
  }

  console.log("[weixin] 未找到已登录账号，启动扫码登录...");
  const start = await startWeixinLoginWithQr({
    apiBaseUrl: DEFAULT_BASE_URL,
    botType: DEFAULT_ILINK_BOT_TYPE,
  });
  if (!start.qrcodeUrl) {
    throw new Error(`获取登录二维码失败: ${start.message}`);
  }

  console.log("\n请用手机微信扫描以下二维码：\n");
  await displayQRCode(start.qrcodeUrl);
  console.log("\n等待扫码确认...\n");

  const result = await waitForWeixinLogin({
    sessionKey: start.sessionKey,
    apiBaseUrl: DEFAULT_BASE_URL,
    timeoutMs: LOGIN_TIMEOUT_MS,
    botType: DEFAULT_ILINK_BOT_TYPE,
  });

  if (!result.connected || !result.botToken || !result.accountId) {
    throw new Error(`登录未完成: ${result.message}`);
  }

  const accountId = normalizeAccountId(result.accountId);
  saveWeixinAccount(accountId, {
    token: result.botToken,
    baseUrl: result.baseUrl,
    userId: result.userId,
  });
  registerWeixinAccountId(accountId);
  console.log(`[weixin] 登录成功，账号 ${accountId}`);

  return {
    accountId,
    token: result.botToken,
    baseUrl: result.baseUrl?.trim() || DEFAULT_BASE_URL,
  };
}
