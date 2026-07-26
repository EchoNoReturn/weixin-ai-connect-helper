import type { PluginRegistry } from "./plugin-system.ts";
import { runStage } from "./plugin-system.ts";
import type { ParsedMessage, RoutedMessage, PromptContext, AgentResult } from "./types.ts";

export interface PipelineStageHandlers<I, O> {
  core: (data: I) => Promise<O>;
}

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
    const ctx = await runStage("route", this.registry.onRoute, routed, this.stages.route.core);
    const prompt = await runStage("context", this.registry.beforePrompt, ctx, this.stages.context.core);
    const result = await runStage("execute", this.registry.onPrompt, prompt, this.stages.execute.core);
    await runStage("send", this.registry.beforeSend, result, this.stages.send.core);
  }

  async runSessionEndHooks(ctx: Parameters<NonNullable<PluginRegistry["onSessionEnd"][0]["handler"]>>[0]): Promise<void> {
    for (const { handler } of this.registry.onSessionEnd) {
      await handler(ctx);
    }
  }
}
