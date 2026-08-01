import type { RoutedMessage, PromptContext } from "@yoyojcoder-weixin-ai/core";
import { getDb } from "@yoyojcoder-weixin-ai/core";

export class ContextBuilder {
  async build(routed: RoutedMessage): Promise<PromptContext> {
    const history = this.loadHistory(routed.sessionId);
    return {
      routed,
      systemPrompt: "",
      history,
      prompt: routed.message.text,
    };
  }

  private loadHistory(sessionId: string): Array<{ role: "user" | "assistant"; content: string }> {
    const db = getDb();
    const rows = db
      .prepare("SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC")
      .all(sessionId) as Array<{ role: string; content: string }>;
    return rows.map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
  }
}
