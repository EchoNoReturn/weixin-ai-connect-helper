import { mkdirSync } from "fs";
import { rootDir, distDir, exeName } from "../lib/env.ts";
import { run } from "../lib/run.ts";

/** 编译 wah CLI 到 dist/ */
export function buildCli(): void {
  mkdirSync(distDir, { recursive: true });

  console.log("Building wah...");
  run("bun", ["build", "--compile", "src/cli/index.ts", "--outfile", `dist/${exeName("wah")}`], {
    cwd: rootDir,
  });
}
