import { sendTextMessage } from "./api.ts";
import type { WeixinCredentials } from "./login.ts";

const TEXT_CHUNK_LIMIT = 4000;

export class WeixinOutbound {
  private contextTokens = new Map<string, string>();
  private sending: Promise<void> = Promise.resolve();

  constructor(private creds: WeixinCredentials) {}

  noteContextToken(userId: string, token?: string): void {
    if (token) this.contextTokens.set(userId, token);
  }

  async sendText(to: string, text: string, replyContextToken?: string): Promise<string[]> {
    const contextToken = replyContextToken ?? this.contextTokens.get(to);
    const task = this.sending.then(() => this.doSend(to, text, contextToken));
    this.sending = task.catch((err) =>
      console.error(`[weixin] 发送失败 to=${to}:`, err),
    ).then(() => undefined);
    return task;
  }

  private async doSend(to: string, text: string, contextToken?: string): Promise<string[]> {
    const messageIds: string[] = [];
    for (const chunk of chunkText(text, TEXT_CHUNK_LIMIT)) {
      const receipt = await sendTextMessage({
        to,
        text: chunk,
        opts: {
          baseUrl: this.creds.baseUrl,
          token: this.creds.token,
          contextToken,
        },
      });
      messageIds.push(receipt.messageId);
    }
    return messageIds;
  }
}

function chunkText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += limit) {
    chunks.push(text.slice(i, i + limit));
  }
  return chunks;
}
