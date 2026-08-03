import path from "path";
import { existsSync } from "fs";
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

/**
 * 解析插件配置文件路径
 * 优先查找二进制目录，回退到当前工作目录
 */
function resolvePluginsPath(file: string): string {
  // 开发阶段：运行的是 .ts 文件
  const isDev = process.argv[1]?.endsWith(".ts");
  
  if (isDev) {
    // 开发阶段：使用当前工作目录
    return file;
  }
  
  // 生产阶段：二进制文件所在目录
  const binDir = path.dirname(process.argv[0] || "");
  const binPath = path.join(binDir, file);
  
  if (existsSync(binPath)) {
    return binPath;
  }
  
  // 回退到当前工作目录
  return file;
}

export async function loadPlugins(file: string): Promise<PluginRegistry> {
  const registry = emptyRegistry();
  const resolvedPath = resolvePluginsPath(file);
  const f = Bun.file(resolvedPath);
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
