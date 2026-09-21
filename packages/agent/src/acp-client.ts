import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type { AgentConfig } from "@yoyojcoder-weixin-ai/core";

export interface PromptResult {
  text: string;
  stopReason: string;
}

export type ChunkHandler = (fullText: string) => void;

export class AcpAgent {
  private sessions = new Map<string, acp.ActiveSession>();
  private queues = new Map<string, Promise<unknown>>();
  private exited = false;
  private disposed = false;
  private readonly exitListeners = new Set<() => void>();

  private constructor(
    readonly id: string,
    private cfg: AgentConfig,
    private proc: ChildProcess,
    private conn: acp.ClientConnection,
  ) {}

  static async start(
    id: string,
    cfg: AgentConfig,
    opts: { autoApprove: boolean },
  ): Promise<AcpAgent> {
    const proc = spawn(cfg.command, cfg.args, {
      stdio: ["pipe", "pipe", "inherit"],
      env: process.env,
      cwd: cfg.cwd,
      windowsHide: true,
    });
    proc.on("error", (err) => console.error(`[acp:${id}] 进程错误:`, err));

    const stream = acp.ndJsonStream(
      Writable.toWeb(proc.stdin!) as WritableStream<Uint8Array>,
      Readable.toWeb(proc.stdout!) as ReadableStream<Uint8Array>,
    );

    const app = acp
      .client({ name: "weixin-ai-connect-helper" })
      .onRequest(acp.methods.client.session.requestPermission, (ctx) => {
        const { toolCall, options } = ctx.params;
        const allow =
          options.find((o) => o.kind?.startsWith("allow")) ?? options[0];
        console.log(
          `[acp:${id}] 权限请求: ${toolCall?.title ?? "未知工具"} → ` +
            (opts.autoApprove && allow ? `自动批准 (${allow.name})` : "取消"),
        );
        if (opts.autoApprove && allow) {
          return { outcome: { outcome: "selected" as const, optionId: allow.optionId } };
        }
        return { outcome: { outcome: "cancelled" as const } };
      });

    const conn = app.connect(stream);
    try {
      const init = await conn.agent.request(acp.methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
        clientInfo: { name: "weixin-ai-connect-helper", version: "0.1.0" },
      });
      const agent = new AcpAgent(id, cfg, proc, conn);
      proc.on("exit", (code) => {
        agent.exited = true;
        console.error(`[acp:${id}] 进程退出 code=${code}`);
        for (const listener of agent.exitListeners) listener();
        agent.exitListeners.clear();
      });
      console.log(`[acp:${id}] agent 已连接 (protocol v${init.protocolVersion})`);
      return agent;
    } catch (error) {
      conn.close();
      if (!proc.killed) proc.kill();
      throw error;
    }
  }

  prompt(userKey: string, text: string, onChunk: ChunkHandler): Promise<PromptResult> {
    const prev = this.queues.get(userKey) ?? Promise.resolve();
    const current = prev.then(
      () => this.runTurn(userKey, text, onChunk),
      () => this.runTurn(userKey, text, onChunk),
    );
    this.queues.set(userKey, current);
    void current.finally(() => {
      if (this.queues.get(userKey) === current) this.queues.delete(userKey);
    }).catch(() => {});
    return current;
  }

  private async runTurn(
    userKey: string,
    text: string,
    onChunk: ChunkHandler,
  ): Promise<PromptResult> {
    const session = await this.getSession(userKey);

    let full = "";
    const promptPromise = session.prompt(text);
    const promptFailure = promptPromise.then(
      () => new Promise<never>(() => {}),
      (error: unknown) => Promise.reject(error),
    );

    let stopReason = "unknown";
    while (true) {
      const msg = await Promise.race([session.nextUpdate(), promptFailure]);
      if (msg.kind === "stop") {
        stopReason = msg.stopReason;
        break;
      }
      const update = msg.update;
      if (
        update.sessionUpdate === "agent_message_chunk" &&
        update.content.type === "text"
      ) {
        full += update.content.text;
        onChunk(full);
      }
    }
    await promptPromise;
    return { text: full, stopReason };
  }

  /** 该 userKey 是否已有（本进程内的）ACP session；用于决定是否注入 systemPrompt */
  hasSession(userKey: string): boolean {
    return this.sessions.has(userKey);
  }

  private async getSession(userKey: string): Promise<acp.ActiveSession> {
    let session = this.sessions.get(userKey);
    if (!session) {
      session = await this.conn.agent.buildSession(this.cfg.cwd).start();
      this.sessions.set(userKey, session);
      console.log(`[acp:${this.id}] 新会话 sessionId=${session.sessionId} user=${userKey}`);
    }
    return session;
  }

  get isAlive(): boolean {
    return !this.exited && !this.disposed;
  }

  onExit(listener: () => void): () => void {
    if (this.exited) {
      listener();
      return () => {};
    }
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const session of this.sessions.values()) session.dispose();
    this.sessions.clear();
    this.queues.clear();
    this.conn.close();
    if (!this.proc.killed) this.proc.kill();
  }
}
