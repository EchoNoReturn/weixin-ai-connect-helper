/**
 * StreamCoalescer — 流式合并器（DESIGN Stage 4）
 *
 * ACP onChunk 回调返回的是累积全文（cumulative full text），
 * 本类跟踪已发送长度 sentLen，按策略把增量片段冲刷出去：
 *
 *   冲刷条件：未发送字符数 >= minChars 且距上次冲刷 >= idleMs
 *   finalize()：prompt 结束时无条件冲刷剩余文本
 *
 * 时钟可注入以便确定性测试。
 */

export interface CoalescerOptions {
  minChars: number;
  idleMs: number;
  /** 发送一个增量片段（新增文本，不是全文） */
  flush: (delta: string) => Promise<void>;
  now?: () => number;
}

export class StreamCoalescer {
  private sentLen = 0;
  private lastFlushAt: number | null = null;
  private readonly now: () => number;

  constructor(private opts: CoalescerOptions) {
    this.now = opts.now ?? Date.now;
  }

  /** 已发送的字符数（供 send 阶段计算剩余文本） */
  get sent(): number {
    return this.sentLen;
  }

  /** 收到累积全文更新；满足策略则冲刷增量 */
  async update(fullText: string): Promise<void> {
    const pending = fullText.length - this.sentLen;
    if (pending < this.opts.minChars) return;

    const now = this.now();
    if (this.lastFlushAt !== null && now - this.lastFlushAt < this.opts.idleMs) return;

    await this.flushDelta(fullText.slice(this.sentLen), now);
  }

  /** prompt 结束：冲刷剩余全部文本，返回剩余部分（若调用方想自己发） */
  async finalize(fullText: string): Promise<string> {
    const rest = fullText.slice(this.sentLen);
    if (rest.length > 0) {
      await this.flushDelta(rest, this.now());
    }
    return rest;
  }

  private async flushDelta(delta: string, at: number): Promise<void> {
    await this.opts.flush(delta);
    this.sentLen += delta.length;
    this.lastFlushAt = at;
  }
}
