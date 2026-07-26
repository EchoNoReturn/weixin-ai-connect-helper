import type { SessionEndContext } from "@yoyojcoder-weixin-ai/core";

const MAX_LAST_MSG = 100;

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m${s % 60}s`;
  return `${s}s`;
}

export default async function onSessionEnd(ctx: SessionEndContext): Promise<void> {
  const last = ctx.lastMessage
    ? `\n最后回复：${ctx.lastMessage.slice(0, MAX_LAST_MSG)}`
    : "";
  await ctx.notify(
    `[会话结束] agent=${ctx.agentId} 时长=${formatDuration(ctx.durationMs)} 结果=${ctx.stopReason}${last}`,
  );
}
