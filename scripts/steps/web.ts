import { existsSync, mkdirSync, cpSync, rmSync } from "fs";
import path from "path";
import { rootDir, distDir } from "../lib/env.ts";
import { run } from "../lib/run.ts";

/**
 * 构建 Web 控制台（vite build）并把产物复制到 dist/app/web/dist ——
 * 生产布局下 web-server.ts 的 resolveStaticDir() 在 <exeDir>/app/web/dist 查找。
 * 没有这一步，打包后的 `wah start --web` 永远 503「Web 控制台未构建」。
 */
export function buildWeb(): void {
  const webDir = path.join(rootDir, "app", "web");
  const builtDir = path.join(webDir, "dist");
  const releaseDir = path.join(distDir, "app", "web", "dist");

  console.log("Building web console...");
  run("bun", ["run", "build"], { cwd: webDir });

  if (!existsSync(path.join(builtDir, "index.html"))) {
    console.error("web 构建产物缺失: app/web/dist/index.html");
    process.exit(1);
  }

  rmSync(releaseDir, { recursive: true, force: true });
  mkdirSync(path.dirname(releaseDir), { recursive: true });
  cpSync(builtDir, releaseDir, { recursive: true });
  console.log(`web 控制台已同步到 ${path.relative(rootDir, releaseDir)}`);
}
