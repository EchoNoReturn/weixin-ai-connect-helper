import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readPluginsFile, writePluginsFile, listPlugins, setPluginEnabled, type PluginsFile } from "../plugins-file.ts";

const sample: PluginsFile = {
  onReceive: [
    { name: "message-filter", enabled: true, entry: "./plugins/message-filter.ts" },
  ],
  onRoute: [],
  beforePrompt: [
    { name: "system-prompt", enabled: true, entry: "./plugins/system-prompt.ts" },
  ],
  onPrompt: [],
  onSessionEnd: [
    { name: "session-notify", enabled: false, entry: "./plugins/session-notify.ts" },
  ],
  beforeSend: [],
};

describe("plugins-file", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "wah-pf-"));
    file = path.join(dir, "plugins.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("readPluginsFile 读取不存在文件返回空对象", async () => {
    expect(await readPluginsFile(file)).toEqual({});
  });

  it("writePluginsFile / readPluginsFile 往返一致", async () => {
    await writePluginsFile(file, sample);
    const back = await readPluginsFile(file);
    expect(back).toEqual(sample);
  });

  it("listPlugins 汇总所有分组的插件", () => {
    const list = listPlugins(sample);
    expect(list).toHaveLength(3);
    const mf = list.find((p) => p.name === "message-filter")!;
    expect(mf.enabled).toBe(true);
    expect(mf.hooks).toEqual(["onReceive"]);
    const sn = list.find((p) => p.name === "session-notify")!;
    expect(sn.enabled).toBe(false);
  });

  it("listPlugins 合并同名插件的多个 hook 分组", () => {
    const multi: PluginsFile = {
      onReceive: [{ name: "multi", enabled: false, entry: "./m.ts" }],
      beforeSend: [{ name: "multi", enabled: true, entry: "./m.ts" }],
    };
    const list = listPlugins(multi);
    expect(list).toHaveLength(1);
    expect(list[0]!.hooks).toEqual(["onReceive", "beforeSend"]);
    expect(list[0]!.enabled).toBe(true); // 任一分组启用即视为启用
  });

  it("setPluginEnabled 切换所有同名条目", () => {
    const data = structuredClone(sample);
    expect(setPluginEnabled(data, "session-notify", true)).toBe(true);
    expect(data.onSessionEnd![0]!.enabled).toBe(true);
    expect(setPluginEnabled(data, "message-filter", false)).toBe(true);
    expect(data.onReceive![0]!.enabled).toBe(false);
  });

  it("setPluginEnabled 插件不存在返回 false", () => {
    expect(setPluginEnabled(structuredClone(sample), "ghost", true)).toBe(false);
  });
});
