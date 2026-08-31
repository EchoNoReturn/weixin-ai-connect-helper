import { Command } from "commander";
import { VERSION } from "../version.ts";

const program = new Command();

program
  .name("wah")
  .description("weixin-ai-connect-helper — 微信 AI Agent 桥接")
  .version(VERSION);

// ── start ──
program
  .command("start")
  .description("启动桥接服务（默认后台运行）")
  .option("-f, --foreground", "前台运行（调试用）")
  .option("--web", "启动 Web 控制台")
  .option("--port <port>", "Web 控制台端口")
  .action(async (opts) => {
    const { execStart } = await import("./commands/start.ts");
    await execStart({ port: Number(opts.port), web: opts.web, foreground: opts.foreground });
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

program
  .command("channels")
  .description("列出已配置的消息渠道")
  .action(async () => {
    const { execChannelsList } = await import("./commands/channels.ts");
    await execChannelsList();
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

// ── access ──
const access = program
  .command("access")
  .description("管理渠道用户访问授权");

access
  .command("list [status]")
  .description("列出访问记录，可按 pending/approved/revoked 过滤")
  .action(async (status?: string) => {
    const { execAccess } = await import("./commands/access.ts");
    await execAccess(["list", ...(status ? [status] : [])]);
  });

access
  .command("approve <user-id>")
  .description("批准待审批用户")
  .action(async (userId: string) => {
    const { execAccess } = await import("./commands/access.ts");
    await execAccess(["approve", userId]);
  });

access
  .command("revoke <user-id>")
  .description("撤销用户访问权限")
  .action(async (userId: string) => {
    const { execAccess } = await import("./commands/access.ts");
    await execAccess(["revoke", userId]);
  });

program.parse();
