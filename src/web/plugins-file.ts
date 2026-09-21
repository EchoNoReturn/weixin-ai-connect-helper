/**
 * plugins.json 配置文件读写（DESIGN §3.5）
 * 文件格式：按 hook 分组的有序数组，每项 { name, enabled, entry }
 */

export interface PluginFileEntry {
  name: string;
  enabled: boolean;
  entry: string;
}

export type PluginsFile = Record<string, PluginFileEntry[]>;

export interface PluginInfo {
  name: string;
  enabled: boolean;
  entry: string;
  hooks: string[]; // 该插件出现在哪些 hook 分组
}

export async function readPluginsFile(path: string): Promise<PluginsFile> {
  const f = Bun.file(path);
  if (!(await f.exists())) return {};
  return (await f.json()) as PluginsFile;
}

export async function writePluginsFile(path: string, data: PluginsFile): Promise<void> {
  await Bun.write(path, JSON.stringify(data, null, 2) + "\n");
}

/** 汇总插件列表：同名插件可能出现在多个 hook 分组 */
export function listPlugins(file: PluginsFile): PluginInfo[] {
  const map = new Map<string, PluginInfo>();
  for (const [hook, entries] of Object.entries(file)) {
    for (const e of entries) {
      const existing = map.get(e.name);
      if (existing) {
        existing.hooks.push(hook);
        // 任一分组启用则视为启用（以第一处为准记录 entry）
        existing.enabled = existing.enabled || e.enabled;
      } else {
        map.set(e.name, { name: e.name, enabled: e.enabled, entry: e.entry, hooks: [hook] });
      }
    }
  }
  return [...map.values()];
}

/**
 * 切换插件启用状态（所有同名条目一起切换）。
 * 返回 false 表示插件不存在。
 */
export function setPluginEnabled(file: PluginsFile, name: string, enabled: boolean): boolean {
  let found = false;
  for (const entries of Object.values(file)) {
    for (const e of entries) {
      if (e.name === name) {
        e.enabled = enabled;
        found = true;
      }
    }
  }
  return found;
}
