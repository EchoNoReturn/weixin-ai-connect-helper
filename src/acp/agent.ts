import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type { AgentConfig } from "../config.ts";

export interface PromptResult {
  /** 本轮 agent 输出的完整文本（agent_message_chunk 累加） */
  text: string;
  stopReason: string;
}

/** 流式回调：每次 agent_message_chunk 到达时给出当前完整文本 */
export type ChunkHandler = (fullText: string) => void;

/**
 * 一个 ACP agent 子进程（如 `opencode acp`）的封装：
 * 持有长连接，按 userKey 维护多轮会话，prompt 串行执行。
 */
export class AcpAgent {
  /** userKey → ACP 会话（同一用户对同一 agent 是连续对话） */
  private sessions = new Map<string, acp.ActiveSession>();
  /** userKey → 串行队列，避免同一用户的 prompt 并发交错 */
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
      stdio: ["pipe", "pipe", "inherit"], // agent 的 stderr 直接透传到桥的终端
      env: process.env,
      cwd: cfg.cwd,
    });
    proc.on("error", (err) => console.error(`[acp:${id}] 进程错误:`, err));
    proc.on("exit", (code) =>
      console.error(`[acp:${id}] 进程退出 code=${code}（后续 prompt 会失败，需重启桥）`),
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
      // 不代理 fs/terminal：agent 用自己的工具直接操作本机
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: { name: "weixin-ai-connect-helper", version: "0.1.0" },
    });
    console.log(`[acp:${id}] agent 已连接 (protocol v${init.protocolVersion})`);

    return new AcpAgent(id, cfg, proc, conn);
  }

  /**
   * 发送一条用户消息并等待本轮完成。
   * 同一 userKey 的多次调用自动串行排队。
   */
  prompt(userKey: string, text: string, onChunk: ChunkHandler): Promise<PromptResult> {
    const prev = this.queues.get(userKey) ?? Promise.resolve();
    const current = prev.then(
      () => this.runTurn(userKey, text, onChunk),
      () => this.runTurn(userKey, text, onChunk), // 前序失败不阻塞后续
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
      // tool_call / plan / thought 等更新 PoC 阶段忽略（见 DESIGN.md §4.4）
    }
    await promptPromise; // 传播可能的 reject
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
