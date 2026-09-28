import os from "node:os";
import type { ChannelAdapter, IncomingMessage, Logger } from "@yoyojcoder-weixin-ai/core";

export function startupNotification(startedAt = new Date()): string {
  let username = "未知";
  try { username = os.userInfo().username; } catch { /* unavailable OS account */ }
  return `[AI 助手已启动]\n启动时间：${startedAt.toLocaleString("zh-CN", { hour12: false })} (${Intl.DateTimeFormat().resolvedOptions().timeZone})\n操作系统：${os.type()} ${os.release()} (${os.arch()})\n主机：${os.hostname()}\n用户名：${username}\n微信发送自检消息；Agent 将在收到请求后启动。`;
}

/** One best-effort reply; a broken transport must not trigger recursive error notices. */
export async function processMessageWithFeedback(
  message: IncomingMessage,
  run: () => Promise<void>,
  channel: Pick<ChannelAdapter, "send"> | undefined,
  log: Pick<Logger, "error">,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    const reference = crypto.randomUUID().slice(0, 8);
    log.error(`处理消息失败 [${reference}] channel=${message.channelId}:`, error);
    const denied = error instanceof Error && error.message.startsWith("非白名单用户 ");
    const text = denied
      ? "[访问未授权] 请联系主机管理员使用 wah access approve 审批后再试。"
      : `[执行失败] AI 助手未能完成本次请求，请稍后重试或联系主机管理员查看 wah status 指示的日志。\n错误编号：${reference}`;
    try {
      if (!channel) throw new Error(`回复渠道不存在: ${message.channelId}`);
      await channel.send({
        channelId: message.channelId,
        conversationId: message.conversationId,
        replyToMessageId: message.messageId,
        replyContext: message.replyContext,
        text,
      });
    } catch (sendError) {
      log.error(`失败提示发送失败 [${reference}]:`, sendError);
    }
  }
}
