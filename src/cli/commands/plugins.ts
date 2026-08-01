import { loadConfig } from "../../config.ts";

export async function execPlugins(args: string[]): Promise<void> {
  const subcommand = args[0] ?? "list";
  const config = await loadConfig();

  switch (subcommand) {
    case "list": {
      const f = Bun.file(config.pluginsFile);
      if (!(await f.exists())) {
        console.log("未找到插件配置文件\n");
        return;
      }
      const raw = JSON.parse(await f.text()) as Record<string, Array<{ name: string; enabled: boolean; entry: string }>>;
      console.log("=== 已注册插件 ===\n");
      for (const [hook, entries] of Object.entries(raw)) {
        if (entries.length === 0) continue;
        console.log(`${hook}:`);
        for (const p of entries) {
          const status = p.enabled ? "✅" : "⬜";
          console.log(`  ${status} ${p.name} → ${p.entry}`);
        }
        console.log("");
      }
      break;
    }
    case "enable":
    case "disable": {
      const pluginName = args[1];
      if (!pluginName) {
        console.error(`用法: bun run cli plugins ${subcommand} <name>`);
        process.exit(1);
      }
      const f = Bun.file(config.pluginsFile);
      if (!(await f.exists())) {
        console.error(`插件配置文件不存在: ${config.pluginsFile}`);
        process.exit(1);
      }
      const raw = JSON.parse(await f.text()) as Record<string, Array<{ name: string; enabled: boolean; entry: string }>>;
      let found = false;
      for (const entries of Object.values(raw)) {
        for (const p of entries) {
          if (p.name === pluginName) {
            p.enabled = subcommand === "enable";
            found = true;
          }
        }
      }
      if (!found) {
        console.error(`插件 "${pluginName}" 不存在`);
        process.exit(1);
      }
      await Bun.write(config.pluginsFile, JSON.stringify(raw, null, 2));
      const action = subcommand === "enable" ? "启用" : "禁用";
      console.log(`✅ 已${action}插件: ${pluginName}\n`);
      break;
    }
    default:
      console.error(`未知子命令: plugins ${subcommand}`);
      console.error("可用子命令: list, enable, disable");
      process.exit(1);
  }
}
