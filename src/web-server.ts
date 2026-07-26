import { createLogger } from "@yoyojcoder-weixin-ai/core";

export function startWebServer(port: number): ReturnType<typeof Bun.spawn> {
  const log = createLogger("web");
  log.info(`启动 Web 控制台 (port=${port})`);

  const proc = Bun.spawn(["bun", "run", "dev"], {
    cwd: "app/web",
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
