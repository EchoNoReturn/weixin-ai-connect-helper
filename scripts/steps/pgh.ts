import { existsSync, copyFileSync, mkdirSync } from "fs";
import path from "path";
import { rootDir, distDir, pghDir, exeName } from "../lib/env.ts";
import { run, hasCommand } from "../lib/run.ts";

export interface BuildPghOptions {
  /** 为 true 时缺少 go 工具链仅警告并跳过（用于全量构建） */
  optional?: boolean;
}

/**
 * 编译 pgh（Go）并复制到 dist/，与 wah 并排（生产布局）。
 * 已编译过则跳过 go build，直接同步产物。
 */
export function buildPgh(opts: BuildPghOptions = {}): void {
  const outputName = exeName("pgh");
  const pghDistDir = path.join(pghDir, "dist");
  const builtPath = path.join(pghDistDir, outputName);
  const releasePath = path.join(distDir, outputName);

  if (existsSync(builtPath)) {
    console.log("pgh 已编译，跳过 go build");
  } else if (opts.optional && !hasCommand("go", ["version"])) {
    console.warn("警告: 未找到 go 工具链，跳过 pgh 编译（生产环境后台模式将回退前台）");
    return;
  } else {
    console.log("正在编译 pgh...");
    mkdirSync(pghDistDir, { recursive: true });
    run("go", ["build", "-o", builtPath, "."], { cwd: pghDir });
    console.log("pgh 编译完成");
  }

  mkdirSync(distDir, { recursive: true });
  copyFileSync(builtPath, releasePath);
  console.log(`pgh 已同步到 ${path.relative(rootDir, releasePath)}`);
}
