import "./env.ts";
import { loadConfig, type BridgeConfig } from "./config.ts";
import { ensureWeixinLogin, WeixinOutbound, runInboundLoop } from "@yoyojcoder-weixin-ai/transport";
import { Pipeline, loadPlugins, createLogger } from "@yoyojcoder-weixin-ai/core";
import { Router, ContextBuilder, SessionManager } from "@yoyojcoder-weixin-ai/orchestration";
import { ProcessManager } from "@yoyojcoder-weixin-ai/agent";
import { runAgentTurn } from "./agent-turn.ts";

export interface BridgeHealth {
  status: "starting" | "connected" | "reconnecting" | "stopped";
  accountId?: string;
  lastMessageAt?: number;
  lastError?: string;
  reconnectAttempts: number;
  startedAt: number;
}

export interface BridgeOptions {
  config?: BridgeConfig;
  abortSignal?: AbortSignal;
}

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 5_000;

export async function startBridge(opts: BridgeOptions = {}) {
  const log = createLogger("bridge");
  const config = opts.config ?? (await loadConfig());
  const abort = opts.abortSignal ?? new AbortController().signal;

  const health: BridgeHealth = {
    status: "starting",
    reconnectAttempts: 0,
    startedAt: Date.now(),
  };

  log.info(`配置就绪: defaultAgent=${config.defaultAgent} agents=[${Object.keys(config.agents).join(", ")}]`);

  const plugins = await loadPlugins(config.pluginsFile);
  log.info(`插件加载完成: ${Object.entries(plugins).map(([k, v]) => `${k}=${v.length}`).join(", ")}`);

  const creds = await ensureWeixinLogin();
  health.accountId = creds.accountId;
  log.info(`微信登录成功: ${creds.accountId}`);

  const outbound = new WeixinOutbound(creds);
  const router = new Router(config);
  const ctxBuilder = new ContextBuilder();
  const sessionMgr = new SessionManager();
  const procMgr = new ProcessManager(config.agents, {
    autoApprove: config.autoApprove,
    lifecycle: {
      onReady: (agentId) => { void pipeline.runAgentReadyHooks(agentId).catch((err: unknown) => log.error("onAgentReady hook 失败:", err)); },
      onExit: (agentId, code) => { void pipeline.runAgentExitHooks(agentId, code).catch((err: unknown) => log.error("onAgentExit hook 失败:", err)); },
    },
  });

  const pipeline: Pipeline = new Pipeline(plugins, {
    receive: {
      core: async (msg) => router.parseRoute(msg),
    },
    route: {
      core: async (routed) => routed,
    },
    context: {
      core: async (routed) => {
        // 确保 sessions 表有记录：/api/sessions 列表与消息外键都依赖这一行
        sessionMgr.getOrCreate(routed.message.fromUserId, routed.agentId);
        return ctxBuilder.build(routed);
      },
    },
    execute: {
      core: async (ctx) => {
        const agentId = ctx.routed.agentId;
        const agent = await procMgr.getAgent(agentId);
        const agentConfig = config.agents[agentId];
        if (!agentConfig) throw new Error(`agent "${agentId}" 配置缺失`);
        outbound.noteContextToken(ctx.routed.message.fromUserId, ctx.routed.message.contextToken);

        return runAgentTurn(ctx, {
          agent,
          agentConfig,
          sendDelta: (userId, delta) => outbound.sendText(userId, delta),
          sessionStore: sessionMgr,
          onSessionEnd: (seCtx) => pipeline.runSessionEndHooks(seCtx),
          streamFlushMinChars: config.streamFlushMinChars,
          streamFlushIdleMs: config.streamFlushIdleMs,
          // ACP session 是否本进程新建（决定 systemPrompt 注入）；必须在 prompt 前判断
          isNewAgentSession: !agent.hasSession(ctx.routed.sessionId),
        });
      },
    },
    send: {
      core: async (result) => {
        // Stage 4 的 StreamCoalescer.finalize 已把完整回复发到微信，
        // 这里只在回复为空且有 stopReason 异常时兜底，正常情况不再重复发送。
        if (!result.text.trim() && result.stopReason !== "completed") {
          await outbound.sendText(
            result.ctx.routed.message.fromUserId,
            `[agent 未返回内容] stopReason=${result.stopReason}`,
          );
        }
      },
    },
  });

  async function runLoop() {
    health.status = "connected";
    health.reconnectAttempts = 0;
    log.info("长轮询开始，等待微信消息...");

    await runInboundLoop({
      creds,
      abortSignal: loopAbort.signal,
      onMessage: async (msg) => {
        outbound.noteContextToken(msg.fromUserId, msg.contextToken);
        health.lastMessageAt = Date.now();
        log.info(`收到 ${msg.fromUserId}: ${msg.text.slice(0, 80)}`);
        try {
          await pipeline.run(msg);
        } catch (err) {
          log.error(`处理消息失败:`, err);
        }
      },
    });
  }

  const loopAbort = new AbortController();

  // 外部 abort → 内部 loopAbort
  if (abort instanceof AbortController) {
    abort.signal.addEventListener("abort", () => loopAbort.abort());
  } else {
    abort.addEventListener("abort", () => loopAbort.abort());
  }

  async function reconnect() {
    if (health.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      health.status = "stopped";
      health.lastError = `重连次数超限 (${MAX_RECONNECT_ATTEMPTS})`;
      log.error(health.lastError);
      return;
    }

    health.status = "reconnecting";
    health.reconnectAttempts++;
    log.warn(`连接断开，${RECONNECT_DELAY_MS / 1000}s 后重连 (第 ${health.reconnectAttempts} 次)...`);
    await Bun.sleep(RECONNECT_DELAY_MS);

    try {
      await runLoop();
    } catch {
      await reconnect();
    }
  }

  // 启动：一直运行直到被 abort
  const loopPromise = (async () => {
    try {
      await runLoop();
    } catch (err) {
      health.lastError = String(err);
      log.error(`长轮询异常: ${health.lastError}`);
      await reconnect();
    }
  })();

  return {
    config,
    health,
    procMgr,
    sessionMgr,
    loopPromise,
    async shutdown() {
      health.status = "stopped";
      log.info("正在停止...");
      loopAbort.abort();
      await procMgr.dispose();
    },
  };
}
