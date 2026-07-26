export interface WeixinMessageItem {
  type?: number;
  text_item?: { text?: string };
}

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
  unregisterWeixinAccountId,
  saveWeixinAccount,
} from "@tencent-weixin/openclaw-weixin/dist/src/auth/accounts.js";

export {
  getSyncBufFilePath,
  loadGetUpdatesBuf,
  saveGetUpdatesBuf,
} from "@tencent-weixin/openclaw-weixin/dist/src/storage/sync-buf.js";

export { normalizeAccountId } from "./openclaw-shim.ts";
