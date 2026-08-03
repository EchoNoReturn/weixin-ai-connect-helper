import { createLogger } from "@yoyojcoder-weixin-ai/core";
import { execSync } from "child_process";
import { isDevMode } from "./cli/pgh.ts";

function findBunPath(): string {
  // 开发模式下直接用 bun
  if (isDevMode()) {
    return "bun";
  }
  
  // 生产模式：尝试找到 bun 的完整路径
  try {
    return execSync("which bun", { encoding: "utf-8" }).trim();
  } catch {
    // 常见安装路径
    const paths = [
      "/opt/homebrew/bin/bun",
      "/usr/local/bin/bun",
      `${process.env.HOME}/.bun/bin/bun`,
    ];
    for (const p of paths) {
      try {
        require("fs").accessSync(p);
        return p;
      } catch {}
    }
    return "bun"; // 回退
  }
}

export function startWebServer(port: number): ReturnType<typeof Bun.spawn> {
  const log = createLogger("web");
  log.info(`启动 Web 控制台 (port=${port})`);

  const bunPath = findBunPath();
  const webDir = isDevMode() 
    ? "app/web" 
    : `${require("path").dirname(process.argv[0])}/app/web`;
  
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
