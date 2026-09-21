import type { PromptContext } from "@yoyojcoder-weixin-ai/core";

/**
 * 拼接最终发送给 agent 的 prompt（DESIGN Stage 3 → Stage 4 衔接）。
 *
 * 规则：systemPrompt 只在 agent 侧 ACP session 为新建时注入，
 * 后续轮次 ACP session 已持有上下文，重复注入会污染对话。
 *
 * 注意：不能用"DB 历史为空"判断首轮 —— ACP session 不随桥重启存活，
 * 而 DB 历史持久；重启后历史非空但 ACP session 是新的，
 * 此时必须重新注入 systemPrompt，否则 agent 永久丢失人设/指令。
 */
export function composePrompt(ctx: PromptContext, isNewAgentSession: boolean): string {
  const sys = ctx.systemPrompt.trim();
  if (sys && isNewAgentSession) {
    return `${sys}\n\n${ctx.prompt}`;
  }
  return ctx.prompt;
}
