import { createLogger } from "@yoyojcoder-weixin-ai/core";
import path from "path";
import { isDevMode, resolveTool } from "./cli/runtime.ts";

function findBunPath(): string {
  // 开发模式下 process.execPath 就是 bun 自身
  if (isDevMode()) {
    return process.execPath;
  }

  // 生产模式：从 wah 同目录 / 常见安装路径 / PATH 中解析
  const found = resolveTool("bun", {
    envVar: "WAH_BUN_PATH",
    extraDirs: [
      "/opt/homebrew/bin",
      "/usr/local/bin",
      `${process.env.HOME}/.bun/bin`,
      `${process.env.USERPROFILE}\\.bun\\bin`,
    ],
  });
  return found ?? "bun"; // 回退：交给 PATH 解析
}

export function startWebServer(port: number): ReturnType<typeof Bun.spawn> {
  const log = createLogger("web");
  log.info(`启动 Web 控制台 (port=${port})`);

  const bunPath = findBunPath();
  const webDir = isDevMode()
    ? "app/web"
    : path.join(path.dirname(process.argv[0] ?? process.execPath), "app", "web");

  const proc = Bun.spawn([bunPath, "run", "dev"], {
    cwd: webDir,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, PORT: String(port) },
  });

  proc.exited.then((code) => {
    if (code !== 0) {
      log.error(`Web 进程退出 code=${code}`);
    }
  });

  return proc;
}
