import type { ParsedMessage, RoutedMessage, PromptContext, AgentResult } from "@yoyojcoder-weixin-ai/core";
import { Router } from "./router.ts";
import { ContextBuilder } from "./context-builder.ts";
import { SessionManager } from "./session-manager.ts";

export { Router } from "./router.ts";
export { ContextBuilder } from "./context-builder.ts";
export { SessionManager } from "./session-manager.ts";

export function createStageHandlers(router: Router, ctxBuilder: ContextBuilder) {
  return {
    receive: {
      core: async (msg: ParsedMessage): Promise<RoutedMessage> => {
        return router.parseRoute(msg);
      },
    },
    route: {
      core: async (msg: RoutedMessage): Promise<RoutedMessage> => {
        return msg;
      },
    },
    context: {
      core: async (routed: RoutedMessage): Promise<PromptContext> => {
        return ctxBuilder.build(routed);
      },
    },
  };
}
