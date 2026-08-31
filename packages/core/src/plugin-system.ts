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

  onReceive?: TransformHook<ParsedMessage>;
  onRoute?: TransformHook<RoutedMessage>;
  beforePrompt?: TransformHook<PromptContext>;
  onPrompt?: TransformHook<AgentResult>;
  onSessionEnd?: LifecycleHook<SessionEndContext>;
  beforeSend?: TransformHook<string>;
  onAgentReady?: LifecycleHook<string>;
  onAgentExit?: (agentId: string, code: number | null) => Promise<void> | void;
}

export type TransformHook<T> = (value: T) => Promise<T | null> | T | null;
export type LifecycleHook<T> = (value: T) => Promise<void> | void;

export interface PluginEntry<T> {
  name: string;
  handler: TransformHook<T>;
}

export interface LifecyclePluginEntry<T> {
  name: string;
  handler: LifecycleHook<T>;
}

export interface PluginRegistry {
  onReceive: PluginEntry<ParsedMessage>[];
  onRoute: PluginEntry<RoutedMessage>[];
  beforePrompt: PluginEntry<PromptContext>[];
  onPrompt: PluginEntry<AgentResult>[];
  onSessionEnd: LifecyclePluginEntry<SessionEndContext>[];
  beforeSend: PluginEntry<string>[];
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
        const entry = { name: p.name, handler: mod.default };
        registry[hook].push(entry as never);
      } catch (err) {
        console.error(`[plugin] 加载插件 "${p.name}" 失败 (${p.entry}):`, err);
      }
    }
  }

  return registry;
}

export async function runHooks<T>(
  hooks: PluginEntry<T>[],
  initial: T,
): Promise<T | null> {
  let current: T | null = initial;
  for (const { handler } of hooks) {
    if (current === null) return null;
    current = await handler(current);
  }
  return current;
}

export async function runStage<I, O>(
  _stageName: string,
  hooks: PluginEntry<I>[],
  initial: I,
  core: (data: I) => Promise<O>,
): Promise<O | null> {
  const transformed = await runHooks(hooks, initial);
  if (transformed === null) return null;
  return core(transformed);
}
