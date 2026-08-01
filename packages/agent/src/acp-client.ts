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
    });
    proc.on("error", (err) => console.error(`[acp:${id}] 进程错误:`, err));
    proc.on("exit", (code) =>
      console.error(`[acp:${id}] 进程退出 code=${code}`),
    );

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
    const init = await conn.agent.request(acp.methods.agent.initialize, {
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: { name: "weixin-ai-connect-helper", version: "0.1.0" },
    });
    console.log(`[acp:${id}] agent 已连接 (protocol v${init.protocolVersion})`);

    return new AcpAgent(id, cfg, proc, conn);
  }

  prompt(userKey: string, text: string, onChunk: ChunkHandler): Promise<PromptResult> {
    const prev = this.queues.get(userKey) ?? Promise.resolve();
    const current = prev.then(
      () => this.runTurn(userKey, text, onChunk),
      () => this.runTurn(userKey, text, onChunk),
    );
    this.queues.set(userKey, current);
    return current;
  }

  private async runTurn(
    userKey: string,
    text: string,
    onChunk: ChunkHandler,
  ): Promise<PromptResult> {
    const session = await this.getSession(userKey);

    let full = "";
    let promptFailure: unknown = null;
    const promptPromise = session.prompt(text);
    promptPromise.catch((err: unknown) => {
      promptFailure = err;
    });

    let stopReason = "unknown";
    while (true) {
      if (promptFailure) throw promptFailure;
      const msg = await session.nextUpdate();
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

  private async getSession(userKey: string): Promise<acp.ActiveSession> {
    let session = this.sessions.get(userKey);
    if (!session) {
      session = await this.conn.agent.buildSession(this.cfg.cwd).start();
      this.sessions.set(userKey, session);
      console.log(`[acp:${this.id}] 新会话 sessionId=${session.sessionId} user=${userKey}`);
    }
    return session;
  }

  async dispose(): Promise<void> {
    for (const session of this.sessions.values()) session.dispose();
    this.sessions.clear();
    this.conn.close();
    if (!this.proc.killed) this.proc.kill();
  }
}
