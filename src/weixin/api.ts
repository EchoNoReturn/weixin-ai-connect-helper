/**
 * 对 @tencent-weixin/openclaw-weixin 深导入的统一封装（typed façade）。
 * 所有对插件 dist/* 的引用集中在这一层，方便锁定版本与日后替换。
 * 协议细节见 DESIGN.md §2。
 */

// ── 类型（mirrors proto: GetUpdatesResp / WeixinMessage，只取用到的字段） ──

export interface WeixinMessageItem {
  type?: number;
  text_item?: { text?: string };
}

/** proto message_type: 0=NONE 1=USER 2=BOT */
export const MESSAGE_TYPE_USER = 1;

export interface WeixinMessage {
  message_type?: number;
  from_user_id?: string;
  to_user_id?: string;
  context_token?: string;
  item_list?: WeixinMessageItem[];
}

export interface GetUpdatesResp {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msgs?: WeixinMessage[];
  get_updates_buf?: string;
  longpolling_timeout_ms?: number;
}

export interface GetUpdatesParams {
  baseUrl: string;
  token?: string;
  get_updates_buf?: string;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

export interface SendTextParams {
  to: string;
  text: string;
  opts: {
    baseUrl: string;
    token?: string;
    contextToken?: string;
    timeoutMs?: number;
  };
}

// ── 深导入 ──

import { getUpdates as rawGetUpdates } from "@tencent-weixin/openclaw-weixin/dist/src/api/api.js";
import { sendMessageWeixin as rawSendMessageWeixin } from "@tencent-weixin/openclaw-weixin/dist/src/messaging/send.js";

export function getUpdates(params: GetUpdatesParams): Promise<GetUpdatesResp> {
  return rawGetUpdates(params) as Promise<GetUpdatesResp>;
}

export function sendTextMessage(params: SendTextParams): Promise<{ messageId: string }> {
  return rawSendMessageWeixin(params);
}

export {
  DEFAULT_ILINK_BOT_TYPE,
  displayQRCode,
  startWeixinLoginWithQr,
  waitForWeixinLogin,
} from "@tencent-weixin/openclaw-weixin/dist/src/auth/login-qr.js";

export {
  DEFAULT_BASE_URL,
  listIndexedWeixinAccountIds,
  loadWeixinAccount,
  registerWeixinAccountId,
  saveWeixinAccount,
} from "@tencent-weixin/openclaw-weixin/dist/src/auth/accounts.js";

export {
  getSyncBufFilePath,
  loadGetUpdatesBuf,
  saveGetUpdatesBuf,
} from "@tencent-weixin/openclaw-weixin/dist/src/storage/sync-buf.js";

export { normalizeAccountId } from "openclaw/plugin-sdk/account-id";
