// 对 @tencent-weixin/openclaw-weixin 深导入（dist/*）的 ambient 类型声明。
// 该包无 exports 封装且不附带 .d.ts，这里只声明我们用到的最小签名面。
// 升级插件版本时需要同步核对（见 DESIGN.md §9）。

declare module "@tencent-weixin/openclaw-weixin/dist/src/auth/login-qr.js" {
  export const DEFAULT_ILINK_BOT_TYPE: string;
  export function displayQRCode(qrcodeUrl: string): Promise<void>;
  export function startWeixinLoginWithQr(opts: {
    accountId?: string;
    apiBaseUrl: string;
    botType: string;
    force?: boolean;
    verbose?: boolean;
  }): Promise<{ qrcodeUrl?: string; message: string; sessionKey: string }>;
  export function waitForWeixinLogin(opts: {
    sessionKey: string;
    apiBaseUrl: string;
    timeoutMs?: number;
    botType?: string;
    verbose?: boolean;
  }): Promise<{
    connected: boolean;
    alreadyConnected?: boolean;
    botToken?: string;
    accountId?: string;
    baseUrl?: string;
    userId?: string;
    message: string;
  }>;
}

declare module "@tencent-weixin/openclaw-weixin/dist/src/auth/accounts.js" {
  export const DEFAULT_BASE_URL: string;
  export const CDN_BASE_URL: string;
  export function listIndexedWeixinAccountIds(): string[];
  export function registerWeixinAccountId(accountId: string): void;
  export function loadWeixinAccount(accountId: string): {
    token?: string;
    baseUrl?: string;
    userId?: string;
  } | null;
  export function saveWeixinAccount(
    accountId: string,
    update: { token?: string; baseUrl?: string; userId?: string },
  ): void;
}

declare module "@tencent-weixin/openclaw-weixin/dist/src/api/api.js" {
  /** 参数/响应结构复杂，统一在 src/weixin/api.ts 的 typed façade 中收敛。 */
  export function getUpdates(params: unknown): Promise<unknown>;
}

declare module "@tencent-weixin/openclaw-weixin/dist/src/messaging/send.js" {
  export function sendMessageWeixin(params: unknown): Promise<{ messageId: string }>;
}

declare module "@tencent-weixin/openclaw-weixin/dist/src/storage/sync-buf.js" {
  export function getSyncBufFilePath(accountId: string): string;
  export function loadGetUpdatesBuf(filePath: string): string | null;
  export function saveGetUpdatesBuf(filePath: string, getUpdatesBuf: string): void;
}

declare module "openclaw/plugin-sdk/account-id" {
  export function normalizeAccountId(raw: string): string;
}
