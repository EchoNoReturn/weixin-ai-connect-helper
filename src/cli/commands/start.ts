import "../../env.ts";
import { startBridge } from "../../bridge.ts";
import { loadConfig } from "../../config.ts";
import { createLogger, initFileLogging } from "@yoyojcoder-weixin-ai/core";
import { checkWeixinCredentials } from "@yoyojcoder-weixin-ai/transport";
import { writePid, clearPid, writeHealth, clearHealth, isRunning, getPidPath } from "../daemon.ts";
import { ensurePghDev, getPghPath } from "../pgh.ts";

export interface StartOptions {
  port?: number;
  noWeb?: boolean;
  foreground?: boolean;
}

export async function execStart(opts: StartOptions): Promise<void> {
  if (await isRunning()) {
    console.error(`桥已在运行中 (PID: 看 ${getPidPath()})`);
    console.error("使用 wah stop 停止后再启动");
    process.exit(1);
  }

  // 检查登录凭证是否可用
  const creds = checkWeixinCredentials();
  if (!creds) {
    console.error("未找到有效的登录凭证");
    console.error("请先运行 wah login 进行微信扫码登录");
    process.exit(1);
  }

  console.log(`使用已登录账号: ${creds.accountId}`);

  // 确保 pgh 工具可用（开发阶段自动打包，仅后台模式需要）
  if (!opts.foreground) {
    ensurePghDev();
  }

  if (opts.foreground) {
    await runForeground(opts);
  } else {
    runBackground(opts);
  }
}

async function runForeground(opts: StartOptions): Promise<void> {
  const logFile = await initFileLogging();
  const log = createLogger("cli");
  log.info(`日志文件: ${logFile}`);

  const config = await loadConfig();
  if (opts.port) config.webPort = opts.port;

  writePid(process.pid);

  const abort = new AbortController();
  process.on("SIGINT", () => { abort.abort(); cleanup(); });
  process.on("SIGTERM", () => { abort.abort(); cleanup(); });

  const bridge = await startBridge({ config, abortSignal: abort.signal });

  const healthTimer = setInterval(() => {
    writeHealth({
      status: bridge.health.status,
      accountId: bridge.health.accountId,
      lastMessageAt: bridge.health.lastMessageAt,
      lastError: bridge.health.lastError,
      reconnectAttempts: bridge.health.reconnectAttempts,
      startedAt: bridge.health.startedAt,
      pid: process.pid,
    });
  }, 5000);

  if (!opts.noWeb) {
    const webPort = config.webPort;
    log.info(`Web 控制台: http://localhost:${webPort}`);
    const { startWebServer } = await import("../../web-server.ts");
    const webProc = startWebServer(webPort);
    abort.signal.addEventListener("abort", () => {
      if (!webProc.killed) webProc.kill();
    });
  }

  function cleanup() {
    clearInterval(healthTimer);
    clearPid();
    clearHealth();
  }

  try {
    await bridge.loopPromise;
  } finally {
    cleanup();
  }
}

function runBackground(opts: StartOptions): void {
  const pghPath = getPghPath();
  
  // 构建要执行的命令
  const command = process.argv[1]?.endsWith(".ts") ? "bun" : (process.argv[0] || "bun");
  const commandArgs = process.argv[1]?.endsWith(".ts") 
    ? ["src/cli/index.ts", "start", "--foreground"]
    : ["start", "--foreground"];
  
  if (opts.noWeb) commandArgs.push("--no-web");
  if (opts.port) commandArgs.push("--port", String(opts.port));
  
  const stateDir = process.env.BRIDGE_STATE_DIR
    ? process.env.BRIDGE_STATE_DIR
    : `${process.env.HOME || process.env.USERPROFILE}/.weixin-ai-connect-helper`;

  try {
    // 使用 pgh 启动后台进程
    const child = Bun.spawn([pghPath, "start", "-f", `${stateDir}/bridge.pid`, command, ...commandArgs], {
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
      env: { ...process.env, BRIDGE_STATE_DIR: stateDir },
      detached: true,
    } as any);

    child.unref();

    console.log(`桥已在后台启动 (PID: ${child.pid})`);
    console.log(`停止: wah stop`);
    console.log(`状态: wah status`);
    process.exit(0);
  } catch (error) {
    console.error("pgh 启动失败:", error);
    process.exit(1);
  }
}
