import {
  MESSAGE_TYPE_USER,
  getSyncBufFilePath,
  getUpdates,
  loadGetUpdatesBuf,
  saveGetUpdatesBuf,
} from "./api.ts";
import type { GetUpdatesResp, WeixinMessage } from "./api.ts";
import type { WeixinCredentials } from "./login.ts";

export interface InboundTextMessage {
  fromUserId: string;
  text: string;
  contextToken?: string;
}

const LONG_POLL_TIMEOUT_MS = 35_000;
const MAX_CONSECUTIVE_FAILURES = 3;
const BACKOFF_DELAY_MS = 30_000;
const RETRY_DELAY_MS = 2_000;

function extractText(msg: WeixinMessage): string {
  const parts: string[] = [];
  for (const item of msg.item_list ?? []) {
    if (item.text_item?.text) parts.push(item.text_item.text);
  }
  return parts.join("\n").trim();
}

function isUserTextMessage(msg: WeixinMessage): boolean {
  return (
    msg.message_type === MESSAGE_TYPE_USER &&
    !!msg.from_user_id?.endsWith("@im.wechat") &&
    extractText(msg).length > 0
  );
}

/**
 * getUpdates 长轮询循环（服务端 hold ~35s）。
 * get_updates_buf 持久化到状态目录，重启不丢消息 offset。
 *
 * onMessage 是 fire-and-forget：agent 执行可能耗时数分钟，
 * 不能阻塞轮询（否则看不到用户的后续消息）。
 */
export async function runInboundLoop(opts: {
  creds: WeixinCredentials;
  abortSignal: AbortSignal;
  onMessage: (msg: InboundTextMessage) => Promise<void>;
}): Promise<void> {
  const { creds, abortSignal, onMessage } = opts;
  const syncFilePath = getSyncBufFilePath(creds.accountId);
  let buf = loadGetUpdatesBuf(syncFilePath) ?? "";
  let consecutiveFailures = 0;

  console.log(`[weixin] 长轮询开始 (account=${creds.accountId})`);

  while (!abortSignal.aborted) {
    let resp: GetUpdatesResp;
    try {
      resp = await getUpdates({
        baseUrl: creds.baseUrl,
        token: creds.token,
        get_updates_buf: buf,
        timeoutMs: LONG_POLL_TIMEOUT_MS,
        abortSignal,
      });
    } catch (err) {
      if (abortSignal.aborted) break;
      consecutiveFailures++;
      const delay =
        consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
          ? BACKOFF_DELAY_MS
          : RETRY_DELAY_MS;
      console.error(
        `[weixin] getUpdates 失败 (连续 ${consecutiveFailures} 次): ${String(err)}；${delay / 1000}s 后重试`,
      );
      await Bun.sleep(delay);
      continue;
    }

    consecutiveFailures = 0;

    if (resp.get_updates_buf && resp.get_updates_buf !== buf) {
      buf = resp.get_updates_buf;
      saveGetUpdatesBuf(syncFilePath, buf);
    }

    for (const msg of resp.msgs ?? []) {
      if (!isUserTextMessage(msg)) continue;
      const inbound: InboundTextMessage = {
        fromUserId: msg.from_user_id!,
        text: extractText(msg),
        contextToken: msg.context_token,
      };
      void onMessage(inbound).catch((err) =>
        console.error("[weixin] 处理消息失败:", err),
      );
    }
  }

  console.log("[weixin] 长轮询已停止");
}
