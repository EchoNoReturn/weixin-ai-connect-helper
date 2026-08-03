import "../../env.ts";
import { startBridge } from "../../bridge.ts";
import { loadConfig } from "../../config.ts";
import { createLogger, initFileLogging } from "@yoyojcoder-weixin-ai/core";
import { checkWeixinCredentials } from "@yoyojcoder-weixin-ai/transport";
import { writePid, clearPid, writeHealth, clearHealth, isRunning, getPidPath } from "../daemon.ts";
import { getPghPath, isPghAvailable, isDevMode } from "../pgh.ts";

export interface StartOptions {
  port?: number;
  web?: boolean;
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

  // 后台模式需要 pgh，如果不可用则回退到前台模式
  if (!opts.foreground && !isPghAvailable()) {
    console.warn("警告: 未找到 pgh 程序，回退到前台模式");
    console.warn("如需后台运行，请确保 pgh 程序在 PATH 中或与 wah 同目录");
    opts.foreground = true;
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

  if (opts.web) {
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
  const command = isDevMode() ? "bun" : (process.execPath || "bun");
  const commandArgs = isDevMode()
    ? ["src/cli/index.ts", "start", "--foreground", "--dev"]
    : ["start", "--foreground"];
  
  // 只有启用 web 时才传递 --web 参数
  if (opts.web) commandArgs.push("--web");
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
