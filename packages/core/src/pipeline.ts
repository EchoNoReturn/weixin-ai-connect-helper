import type { PluginRegistry } from "./plugin-system.ts";
import { runStage } from "./plugin-system.ts";
import type { ParsedMessage, RoutedMessage, PromptContext, AgentResult, SessionEndContext } from "./types.ts";

export interface PipelineStageHandlers<I, O> {
  core: (data: I) => Promise<O>;
}

const identity = async <T>(x: T): Promise<T> => x;

/**
 * 消息生命周期管道（DESIGN §2）
 *
 * hook 时序语义：
 *  - onReceive / onRoute：hook 在阶段 core 之前，接收并修改阶段输入
 *  - beforePrompt：hook 在 context core 之后，接收 PromptContext（可改 systemPrompt/history/prompt）
 *  - onPrompt：hook 在 execute core 之后，接收 AgentResult（可改 text 等）
 *  - beforeSend：hook 在 send core 之前，接收 AgentResult
 */
export class Pipeline {
  constructor(
    private registry: PluginRegistry,
    private stages: {
      receive: PipelineStageHandlers<ParsedMessage, RoutedMessage>;
      route: PipelineStageHandlers<RoutedMessage, RoutedMessage>;
      context: PipelineStageHandlers<RoutedMessage, PromptContext>;
      execute: PipelineStageHandlers<PromptContext, AgentResult>;
      send: PipelineStageHandlers<AgentResult, void>;
    },
  ) {}

  async run(msg: ParsedMessage): Promise<void> {
    const routed = await runStage("receive", this.registry.onReceive, msg, this.stages.receive.core);
    const routed2 = await runStage("route", this.registry.onRoute, routed, this.stages.route.core);
    const ctx = await this.stages.context.core(routed2);
    const ctx2 = await runStage("beforePrompt", this.registry.beforePrompt, ctx, identity);
    const result = await this.stages.execute.core(ctx2);
    const result2 = await runStage("onPrompt", this.registry.onPrompt, result, identity);
    await runStage("send", this.registry.beforeSend, result2, this.stages.send.core);
  }

  async runSessionEndHooks(ctx: SessionEndContext): Promise<void> {
    for (const { handler } of this.registry.onSessionEnd) {
      await handler(ctx);
    }
  }

  async runAgentReadyHooks(agentId: string): Promise<void> {
    for (const { handler } of this.registry.onAgentReady) {
      await handler(agentId);
    }
  }

  async runAgentExitHooks(agentId: string, code: number | null): Promise<void> {
    for (const { handler } of this.registry.onAgentExit) {
      await handler(agentId, code);
    }
  }
}
