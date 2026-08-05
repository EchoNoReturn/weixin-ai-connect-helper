import "../../env.ts";
import path from "node:path";
import { startBridge } from "../../bridge.ts";
import { loadConfig } from "../../config.ts";
import { createLogger, initFileLogging } from "@yoyojcoder-weixin-ai/core";
import { checkWeixinCredentials } from "@yoyojcoder-weixin-ai/transport";
import { writePid, clearPid, writeHealth, clearHealth, isRunning, getPidPath, getStateDir, getLogsDir } from "../daemon.ts";
import { findPgh, isPghAvailable } from "../pgh.ts";
import { isDevMode } from "../runtime.ts";

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
    console.warn("如需后台运行，请将 pgh 放到 wah 同目录或 PATH 中，或设置 WAH_PGH_PATH");
    opts.foreground = true;
  }

  if (opts.foreground) {
    await runForeground(opts);
  } else {
    runBackground(opts);
  }
}

async function runForeground(opts: StartOptions): Promise<void> {
  const logFile = await initFileLogging(getLogsDir());
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
  const pghPath = findPgh();
  if (!pghPath) {
    console.error("未找到 pgh 程序，无法后台启动");
    process.exit(1);
  }

  // 构建要执行的命令
  const command = isDevMode() ? "bun" : process.execPath;
  const commandArgs = isDevMode()
    ? ["src/cli/index.ts", "start", "--foreground"]
    : ["start", "--foreground"];
  
  // 只有启用 web 时才传递 --web 参数
  if (opts.web) commandArgs.push("--web");
  if (opts.port) commandArgs.push("--port", String(opts.port));
  
  const stateDir = getStateDir();

  try {
    // pgh 使用独立的 pid 文件（pgh.pid），与 bridge.pid 分开。
    // bridge.pid 由前台进程自己写入，避免 pgh 写入的中间进程 PID
    // 导致前台进程 isRunning() 误判。
    const pghPidPath = path.join(getStateDir(), "pgh.pid");
    const pghCmd = `${pghPath} start -f ${pghPidPath} ${command} ${commandArgs.join(" ")}`;
    const result = Bun.spawnSync(["/bin/sh", "-c", pghCmd], {
      env: { ...process.env, BRIDGE_STATE_DIR: stateDir },
      stdout: "inherit",
      stderr: "inherit",
    });

    if (result.exitCode !== 0) {
      console.error(`pgh 退出码 ${result.exitCode}`);
      process.exit(result.exitCode ?? 1);
    }

    console.log("桥已在后台启动");
    console.log("停止: wah stop");
    console.log("状态: wah status");
  } catch (error) {
    console.error("pgh 启动失败:", error);
    process.exit(1);
  }
}
