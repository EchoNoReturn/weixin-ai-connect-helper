import type {
  ParsedMessage,
  RoutedMessage,
  PromptContext,
  AgentResult,
  SessionEndContext,
} from "./types.ts";

export interface BridgePlugin {
  name: string;
  version?: string;

  onReceive?: (msg: ParsedMessage, next: () => Promise<void>) => Promise<ParsedMessage>;
  onRoute?: (msg: RoutedMessage, next: () => Promise<void>) => Promise<RoutedMessage>;
  beforePrompt?: (ctx: PromptContext, next: () => Promise<void>) => Promise<PromptContext>;
  onPrompt?: (result: AgentResult, next: () => Promise<void>) => Promise<AgentResult>;
  onSessionEnd?: (ctx: SessionEndContext) => Promise<void>;
  beforeSend?: (text: string, next: () => Promise<void>) => Promise<string>;
  onAgentReady?: (agentId: string) => Promise<void>;
  onAgentExit?: (agentId: string, code: number | null) => Promise<void>;
}

export interface PluginEntry {
  name: string;
  handler: Function;
}

export interface PluginRegistry {
  onReceive: PluginEntry[];
  onRoute: PluginEntry[];
  beforePrompt: PluginEntry[];
  onPrompt: PluginEntry[];
  onSessionEnd: PluginEntry[];
  beforeSend: PluginEntry[];
}

function emptyRegistry(): PluginRegistry {
  return {
    onReceive: [],
    onRoute: [],
    beforePrompt: [],
    onPrompt: [],
    onSessionEnd: [],
    beforeSend: [],
  };
}

interface PluginConfigEntry {
  name: string;
  enabled: boolean;
  entry: string;
}

export async function loadPlugins(file: string): Promise<PluginRegistry> {
  const registry = emptyRegistry();
  const f = Bun.file(file);
  if (!(await f.exists())) {
    return registry;
  }

  const raw = JSON.parse(await f.text()) as Record<string, PluginConfigEntry[]>;

  for (const [hookName, entries] of Object.entries(raw)) {
    if (!(hookName in registry)) continue;
    const hook = hookName as keyof PluginRegistry;
    for (const p of entries) {
      if (!p.enabled) continue;
      try {
        const mod = await import(p.entry);
        registry[hook].push({ name: p.name, handler: mod.default });
      } catch (err) {
        console.error(`[plugin] 加载插件 "${p.name}" 失败 (${p.entry}):`, err);
      }
    }
  }

  return registry;
}

export async function runStage<I>(
  stageName: string,
  hooks: PluginEntry[],
  initial: I,
  core: (data: I) => Promise<any>,
): Promise<any> {
  let idx = 0;
  const next = async (): Promise<void> => {
    if (idx < hooks.length) {
      const { handler } = hooks[idx++];
      await handler(initial, next);
      await next();
    }
  };
  await next();
  return core(initial);
}
