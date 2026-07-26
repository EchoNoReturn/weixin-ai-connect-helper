import type { SessionEndContext } from "@yoyojcoder-weixin-ai/core";

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m${s % 60}s`;
  return `${s}s`;
}

export async function notifySessionEnd(
  ctx: SessionEndContext,
  sendText: (to: string, text: string) => Promise<void>,
  ownerUserId: string,
): Promise<void> {
  const last = ctx.lastMessage
    ? `\n最后回复：${ctx.lastMessage.slice(0, 100)}`
    : "";
  await sendText(
    ownerUserId,
    `[会话结束] agent=${ctx.agentId} 时长=${formatDuration(ctx.durationMs)} 结果=${ctx.stopReason}${last}`,
  );
}
