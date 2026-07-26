import type { PromptContext } from "@yoyojcoder-weixin-ai/core";

const SYSTEM_PROMPT = "你是一个 AI 助手，通过微信与用户交互。";

export default function beforePrompt(
  ctx: PromptContext,
  next: () => Promise<void>,
): Promise<PromptContext> {
  ctx.systemPrompt = SYSTEM_PROMPT;
  return next();
}
