import "./env.ts";
import { loadConfig, type BridgeConfig } from "./config.ts";
import { Pipeline, loadPlugins, createLogger, type ChannelAdapter, type ChannelConnectionState, type IncomingMessage } from "@yoyojcoder-weixin-ai/core";
import { Router, ContextBuilder, SessionManager, AccessManager } from "@yoyojcoder-weixin-ai/orchestration";
import { ProcessManager } from "@yoyojcoder-weixin-ai/agent";
import { createChannelAdapters } from "./channels.ts";

export interface BridgeHealth {
  status: "starting" | "connected" | "reconnecting" | "stopped";
  accountId?: string;
  lastMessageAt?: number;
  lastError?: string;
  reconnectAttempts: number;
  startedAt: number;
  channels: Record<string, {
    platform: string;
    status: ChannelConnectionState;
    accountId?: string;
    lastError?: string;
  }>;
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
    channels: {},
  };

  log.info(`配置就绪: defaultAgent=${config.defaultAgent} agents=[${Object.keys(config.agents).join(", ")}]`);

  const plugins = await loadPlugins(config.pluginsFile);
  log.info(`插件加载完成: ${Object.entries(plugins).map(([k, v]) => `${k}=${v.length}`).join(", ")}`);

  const channels = await createChannelAdapters(config);
  const channelsById = new Map(channels.map((channel) => [channel.channelId, channel]));
  health.accountId = channels.find((channel) => channel.platform === "weixin")?.accountId;
  log.info(`渠道就绪: ${channels.map((channel) => `${channel.channelId}(${channel.platform})`).join(", ")}`);
  const accessMgr = new AccessManager();
  const router = new Router(config, accessMgr);
  const ctxBuilder = new ContextBuilder();
  const sessionMgr = new SessionManager();
  const procMgr = new ProcessManager(config.agents, { autoApprove: config.autoApprove });

  const pipeline = new Pipeline(plugins, {
    receive: {
      core: async (msg) => router.parseRoute(msg),
    },
    route: {
      core: async (routed) => routed,
    },
    context: {
      core: async (routed) => ctxBuilder.build(routed),
    },
    execute: {
      core: async (ctx) => {
        const agent = await procMgr.getAgent(ctx.routed.agentId);

        sessionMgr.getOrCreate(ctx.routed.message.senderId, ctx.routed.agentId, ctx.routed.sessionId);
        sessionMgr.saveMessage(ctx.routed.sessionId, "user", ctx.prompt);

        const startTime = Date.now();
        const result = await agent.prompt(ctx.routed.sessionId, ctx.prompt, () => {});

        sessionMgr.saveMessage(ctx.routed.sessionId, "assistant", result.text);

        return {
          ctx,
          text: result.text,
          stopReason: result.stopReason,
          durationMs: Date.now() - startTime,
        };
      },
    },
    send: {
      core: async (result) => {
        if (result.text.trim()) {
          const incoming = result.ctx.routed.message;
          const channel = channelsById.get(incoming.channelId);
          if (!channel) throw new Error(`发送渠道不存在: ${incoming.channelId}`);
          await channel.send({
            channelId: incoming.channelId,
            conversationId: incoming.conversationId,
            text: result.text,
            replyToMessageId: incoming.messageId,
            replyContext: incoming.replyContext,
          });
        }
      },
    },
  });

  const loopAbort = new AbortController();

  // 外部 abort → 内部 loopAbort
  if (abort instanceof AbortController) {
    abort.signal.addEventListener("abort", () => loopAbort.abort());
  } else {
    abort.addEventListener("abort", () => loopAbort.abort());
  }

  const channelStates = new Map<string, ChannelConnectionState>();
  const updateHealth = (channelId: string, state: ChannelConnectionState, error?: Error) => {
    channelStates.set(channelId, state);
    const channel = channelsById.get(channelId);
    health.channels[channelId] = {
      platform: channel?.platform ?? "unknown",
      status: state,
      accountId: channel?.accountId,
      lastError: error?.message,
    };
    if (error) health.lastError = `[${channelId}] ${error.message}`;
    const states = [...channelStates.values()];
    health.status = states.includes("connected")
      ? "connected"
      : states.includes("reconnecting")
        ? "reconnecting"
        : states.every((value) => value === "stopped")
          ? "stopped"
          : "starting";
  };

  const onMessage = async (msg: IncomingMessage) => {
    health.lastMessageAt = Date.now();
    log.info(`收到 [${msg.channelId}] ${msg.senderId}: ${msg.text.slice(0, 80)}`);
    try {
      await pipeline.run(msg);
    } catch (err) {
      log.error("处理消息失败:", err);
    }
  };

  async function runChannel(channel: ChannelAdapter): Promise<void> {
    let attempts = 0;
    while (!loopAbort.signal.aborted && attempts <= MAX_RECONNECT_ATTEMPTS) {
      try {
        await channel.start({
          abortSignal: loopAbort.signal,
          onMessage,
          onStateChange: (state, error) => updateHealth(channel.channelId, state, error),
        });
        if (loopAbort.signal.aborted) return;
        throw new Error("接收循环意外结束");
      } catch (error) {
        attempts++;
        health.reconnectAttempts++;
        const err = error instanceof Error ? error : new Error(String(error));
        updateHealth(channel.channelId, "reconnecting", err);
        if (attempts > MAX_RECONNECT_ATTEMPTS) {
          updateHealth(channel.channelId, "stopped", err);
          log.error(`[${channel.channelId}] 重连次数超限`);
          return;
        }
        log.warn(`[${channel.channelId}] ${RECONNECT_DELAY_MS / 1000}s 后重连 (第 ${attempts} 次)`);
        await Bun.sleep(RECONNECT_DELAY_MS);
      }
    }
  }

  const loopPromise = Promise.all(channels.map(runChannel)).then(() => undefined);
  let shuttingDown = false;

  return {
    config,
    health,
    channels,
    procMgr,
    loopPromise,
    async shutdown() {
      if (shuttingDown) return;
      shuttingDown = true;
      health.status = "stopped";
      log.info("正在停止...");
      loopAbort.abort();
      await loopPromise;
      await procMgr.dispose();
    },
  };
}
