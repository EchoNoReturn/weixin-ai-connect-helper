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

  async sendText(to: string, text: string): Promise<void> {
    const task = this.sending.then(() => this.doSend(to, text));
    this.sending = task.catch((err) =>
      console.error(`[weixin] 发送失败 to=${to}:`, err),
    );
    await task;
  }

  private async doSend(to: string, text: string): Promise<void> {
    const contextToken = this.contextTokens.get(to);
    for (const chunk of chunkText(text, TEXT_CHUNK_LIMIT)) {
      await sendTextMessage({
        to,
        text: chunk,
        opts: {
          baseUrl: this.creds.baseUrl,
          token: this.creds.token,
          contextToken,
        },
      });
    }
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
