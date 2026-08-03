import { copyFileSync, mkdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import path from "path";

const rootDir = path.join(import.meta.dir, "..");
const distDir = path.join(rootDir, "dist");

// 确保 dist 目录存在
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// 1. 生成版本文件
console.log("Generating version.ts...");
execSync("bun run scripts/gen-version.ts", {
  cwd: rootDir,
  stdio: "inherit",
});

// 2. 编译二进制
console.log("Building wah...");
execSync("bun build --compile src/cli/index.ts --outfile dist/wah", {
  cwd: rootDir,
  stdio: "inherit",
});

// 3. 复制 package.json 到 dist
console.log("Copying package.json to dist...");
copyFileSync(path.join(rootDir, "package.json"), path.join(distDir, "package.json"));

console.log("Build complete!");
