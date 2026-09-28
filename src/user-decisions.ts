import type { IncomingMessage } from "@yoyojcoder-weixin-ai/core";

type Send = (message: IncomingMessage, text: string) => Promise<void>;
interface Pending {
  owner: IncomingMessage;
  parse: (text: string) => unknown;
  state: "queued" | "waiting" | "answering" | "finished";
  start: () => void;
  finish: (value: unknown | null, error?: unknown) => void;
}

/** One visible question per sender/conversation; answers bypass the blocked prompt queue. */
export class UserDecisions {
  private queues = new Map<string, Pending[]>();
  private closed = false;
  constructor(private send: Send, private timeoutMs = 5 * 60_000) {}

  ask<T>(owner: IncomingMessage, question: string, parse: (text: string) => T, signal: AbortSignal): Promise<T | null> {
    if (this.closed || signal.aborted) return Promise.resolve(null);
    const key = this.key(owner);
    return new Promise<T | null>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const abort = () => pending.finish(null);
      const pending: Pending = {
        owner, parse, state: "queued",
        finish: (value, error) => {
          if (pending.state === "finished") return;
          pending.state = "finished";
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          const queue = this.queues.get(key)!;
          const wasFirst = queue[0] === pending;
          queue.splice(queue.indexOf(pending), 1);
          if (!queue.length) this.queues.delete(key);
          if (error !== undefined) reject(error); else resolve(value as T | null);
          if (wasFirst && !this.closed) queue[0]?.start();
        },
        start: () => {
          if (pending.state !== "queued") return;
          pending.state = "waiting";
          // Only a displayed question consumes the response timeout.
          void (async () => {
            try {
              await this.send(owner, `[需要你决定]\n${question}\n\n直接回复数字或答案即可；回复“取消”结束本次等待。\n${Math.ceil(this.timeoutMs / 60_000)} 分钟内未回复将取消，不会自动替你选择。`);
              if (pending.state !== "waiting") return;
              timer = setTimeout(() => {
                if (pending.state !== "waiting") return;
                void this.send(owner, "问题已超时，已取消本次等待，未替你做选择。").catch(() => {});
                pending.finish(null);
              }, this.timeoutMs);
            } catch (error) { pending.finish(null, error); }
          })();
        },
      };
      const queue = this.queues.get(key) ?? [];
      queue.push(pending);
      this.queues.set(key, queue);
      signal.addEventListener("abort", abort, { once: true });
      if (queue.length === 1) pending.start();
    });
  }

  async handle(message: IncomingMessage): Promise<boolean> {
    const queue = this.queues.get(this.key(message));
    const pending = queue?.[0];
    if (!pending) return false;
    for (const question of queue!) question.owner.replyContext = message.replyContext;
    if (pending.state !== "waiting") return true;
    const text = message.text.trim();
    let value: unknown = null;
    if (text !== "取消") {
      try { value = pending.parse(text); }
      catch (error) {
        await this.send(message, `答案无效：${error instanceof Error ? error.message : "请按问题要求回复"}\n直接重新回复答案即可，或回复“取消”。`);
        return true;
      }
    }
    pending.state = "answering";
    try { await this.send(message, value === null ? "已取消本次等待。" : "已收到你的回答。"); }
    finally { pending.finish(value); }
    return true;
  }

  close(): void {
    this.closed = true;
    for (const queue of [...this.queues.values()]) {
      for (const pending of [...queue]) pending.finish(null);
    }
  }

  private key(message: IncomingMessage): string {
    return JSON.stringify([message.channelId, message.accountId, message.conversationId, message.senderId]);
  }
}
