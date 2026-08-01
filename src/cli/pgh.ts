import { existsSync, mkdirSync } from "fs";
import path from "path";
import { execSync } from "child_process";

/**
 * 判断是否为开发阶段
 * 开发阶段：运行的是 .ts 文件，或者存在 tool/pgh/ 目录
 */
export function isDevMode(): boolean {
  const isTsFile = process.argv[1]?.endsWith(".ts");
  const hasPghSource = existsSync(path.join(__dirname, "../../tool/pgh"));
  return isTsFile || hasPghSource;
}

/**
 * 获取 pgh 可执行文件路径
 */
export function getPghPath(): string {
  if (isDevMode()) {
    // 开发阶段：tool/pgh/dist/pgh.exe
    return path.join(__dirname, "../../tool/pgh/dist/pgh.exe");
  } else {
    // 生产阶段：wah 同级目录
    return path.join(path.dirname(process.argv[0] || ""), "pgh");
  }
}

/**
 * 开发阶段确保 pgh 可用
 * 如果不存在则自动打包
 */
export function ensurePghDev(): void {
  if (!isDevMode()) {
    return;
  }

  const pghPath = getPghPath();
  if (existsSync(pghPath)) {
    return;
  }

  console.log("pgh 未找到，正在自动打包...");
  
  try {
    const pghDir = path.join(__dirname, "../../tool/pgh");
    const distDir = path.join(pghDir, "dist");
    
    // 确保 dist 目录存在
    if (!existsSync(distDir)) {
      mkdirSync(distDir, { recursive: true });
    }
    
    // 执行 go build
    execSync(`go build -o ${path.join(distDir, "pgh.exe")} .`, {
      cwd: pghDir,
      stdio: "inherit",
    });
    
    console.log("pgh 打包完成");
  } catch (error) {
    console.error("pgh 自动打包失败:", error);
    process.exit(1);
  }
}