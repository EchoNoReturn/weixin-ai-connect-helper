import { Command } from "commander";

const program = new Command();

program
  .name("wah")
  .description("weixin-ai-connect-helper — 微信 AI Agent 桥接")
  .version((JSON.parse(await Bun.file("package.json").text())).version);

// ── start ──
program
  .command("start")
  .description("启动桥接服务（默认后台运行）")
  .option("-f, --foreground", "前台运行（调试用）")
  .option("--no-web", "不启动 Web 控制台")
  .option("--port <port>", "Web 控制台端口")
  .action(async (opts) => {
    const { execStart } = await import("./commands/start.ts");
    await execStart({ port: Number(opts.port), noWeb: !opts.web, foreground: opts.foreground });
  });

// ── stop ──
program
  .command("stop")
  .description("停止桥接服务")
  .action(async () => {
    const { execStop } = await import("./commands/stop.ts");
    await execStop();
  });

// ── restart ──
program
  .command("restart")
  .description("重启桥接服务")
  .action(async () => {
    const { execStop } = await import("./commands/stop.ts");
    await execStop();
    const { execStart } = await import("./commands/start.ts");
    await execStart({ foreground: false });
  });

// ── auth (alias: a) ──
const auth = program
  .command("auth")
  .alias("a")
  .description("认证管理");

auth
  .command("login")
  .description("微信扫码登录")
  .action(async () => {
    const { execLogin } = await import("./commands/login.ts");
    await execLogin();
  });

auth
  .command("logout")
  .description("微信登出")
  .action(async () => {
    const { execLogout } = await import("./commands/logout.ts");
    await execLogout();
  });

// ── status ──
program
  .command("status")
  .description("查看运行状态")
  .action(async () => {
    const { execStatus } = await import("./commands/status.ts");
    await execStatus();
  });

// ── plugins (alias: p) ──
const plugins = program
  .command("plugins")
  .alias("p")
  .description("插件管理");

plugins
  .command("list")
  .description("列出已注册插件")
  .action(async () => {
    const { execPlugins } = await import("./commands/plugins.ts");
    await execPlugins(["list"]);
  });

plugins
  .command("enable <name>")
  .description("启用插件")
  .action(async (name: string) => {
    const { execPlugins } = await import("./commands/plugins.ts");
    await execPlugins(["enable", name]);
  });

plugins
  .command("disable <name>")
  .description("禁用插件")
  .action(async (name: string) => {
    const { execPlugins } = await import("./commands/plugins.ts");
    await execPlugins(["disable", name]);
  });

program.parse();
