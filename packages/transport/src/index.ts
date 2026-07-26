export { ensureWeixinLogin, checkWeixinCredentials, type WeixinCredentials } from "./weixin/login.ts";
export { runInboundLoop } from "./weixin/inbound.ts";
export { WeixinOutbound } from "./weixin/outbound.ts";
export {
  getUpdates,
  sendTextMessage,
  DEFAULT_BASE_URL,
  listIndexedWeixinAccountIds,
  loadWeixinAccount,
  saveWeixinAccount,
  registerWeixinAccountId,
  getSyncBufFilePath,
  loadGetUpdatesBuf,
  saveGetUpdatesBuf,
  normalizeAccountId,
  displayQRCode,
  startWeixinLoginWithQr,
  waitForWeixinLogin,
  DEFAULT_ILINK_BOT_TYPE,
} from "./weixin/api.ts";
