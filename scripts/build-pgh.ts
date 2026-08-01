import { existsSync, mkdirSync } from "fs";
import path from "path";
import { execSync } from "child_process";

const root = path.resolve(import.meta.dir, "..");
const pghDir = path.join(root, "tool", "pgh");
const distDir = path.join(pghDir, "dist");

// 确保 dist 目录存在
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// 确定输出文件名
const isWindows = process.platform === "win32";
const outputName = isWindows ? "pgh.exe" : "pgh";
const outputPath = path.join(distDir, outputName);

console.log("正在编译 pgh...");
console.log(`源目录: ${pghDir}`);
console.log(`输出路径: ${outputPath}`);

try {
  // 执行 go build
  execSync(`go build -o ${outputPath} .`, {
    cwd: pghDir,
    stdio: "inherit",
  });
  
  console.log("pgh 编译完成");
} catch (error) {
  console.error("pgh 编译失败:", error);
  process.exit(1);
}