import type { PluginRegistry } from "./plugin-system.ts";
import { runHooks, runStage } from "./plugin-system.ts";
import type { ParsedMessage, RoutedMessage, PromptContext, AgentResult, SessionEndContext } from "./types.ts";

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
    if (routed === null) return;
    const ctx = await runStage("route", this.registry.onRoute, routed, this.stages.route.core);
    if (ctx === null) return;

    const builtPrompt = await this.stages.context.core(ctx);
    const prompt = await runHooks(this.registry.beforePrompt, builtPrompt);
    if (prompt === null) return;

    const executedResult = await this.stages.execute.core(prompt);
    const result = await runHooks(this.registry.onPrompt, executedResult);
    if (result === null) return;

    const text = await runHooks(this.registry.beforeSend, result.text);
    if (text === null) return;
    await this.stages.send.core({ ...result, text });
  }

  async runSessionEndHooks(ctx: SessionEndContext): Promise<void> {
    for (const { handler } of this.registry.onSessionEnd) {
      await handler(ctx);
    }
  }
}
