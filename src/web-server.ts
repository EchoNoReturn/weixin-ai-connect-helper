import path from "node:path";
import { existsSync } from "node:fs";
import { createLogger } from "@yoyojcoder-weixin-ai/core";
import type { BridgeConfig } from "@yoyojcoder-weixin-ai/core";
import { SessionManager } from "@yoyojcoder-weixin-ai/orchestration";
import { createApiServer } from "./web/api-server.ts";
import { saveConfig } from "./config.ts";
import { getConfigPath } from "./bin-dir.ts";
import { isDevMode } from "./cli/runtime.ts";
import { VERSION } from "./version.ts";
import type { BridgeHealth } from "./bridge.ts";

export interface WebServerHandle {
  port: number;
  stop: () => void;
}

/**
 * 启动内嵌 Web 控制台（API + 静态资源）。
 * 生产/开发都直接由桥进程内 Bun.serve 提供；前端源码改动用 bun run dev:web（vite）开发，
 * 构建产物 app/web/dist 由本服务托管。
 */
export function startWebServer(opts: {
  port: number;
  getHealth: () => BridgeHealth;
  config: BridgeConfig;
  sessionMgr: SessionManager;
}): WebServerHandle {
  const log = createLogger("web");

  // 当前配置的可变引用（saveConfig 后更新，getConfig 读到最新值）
  let currentConfig = opts.config;

  const staticDir = resolveStaticDir();
  const pluginsFile = getConfigPath(currentConfig.pluginsFile || "plugins.json");

  const server = createApiServer({
    port: opts.port,
    staticDir,
    deps: {
      getStatus: () => ({ health: opts.getHealth(), version: VERSION }),
      getConfig: () => currentConfig,
      saveConfig: async (next) => {
        currentConfig = await saveConfig(next);
        return currentConfig;
      },
      listSessions: () => opts.sessionMgr.list(),
      getSessionMessages: (id, limit) => opts.sessionMgr.getMessages(id, limit),
      pluginsFile,
    },
  });

  const actualPort = server.port ?? opts.port;
  log.info(`Web 控制台已启动: http://127.0.0.1:${actualPort}${staticDir ? "" : "（前端未构建，仅 API）"}`);

  return {
    port: actualPort,
    stop: () => server.stop(true),
  };
}

function resolveStaticDir(): string | undefined {
  const candidates = isDevMode()
    ? [path.resolve(process.cwd(), "app/web/dist")]
    : [path.join(path.dirname(process.execPath), "app", "web", "dist")];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "index.html"))) return dir;
  }
  return undefined;
}
