import { existsSync } from "fs";
import path from "path";

/**
 * 判断是否为开发阶段
 * 通过环境变量 WAH_DEV=1 或 process.argv 中的 --dev 标志判断
 */
export function isDevMode(): boolean {
  // 环境变量判断
  if (process.env.WAH_DEV === "1") {
    return true;
  }
  // 命令行参数判断
  return process.argv.includes("--dev");
}

/**
 * 获取 pgh 可执行文件路径
 */
export function getPghPath(): string {
  if (isDevMode()) {
    // 开发阶段：tool/pgh/dist/pgh.exe
    return path.join(__dirname, "../../tool/pgh/dist/pgh.exe");
  }
  
  // 生产阶段：使用 process.execPath 获取二进制目录
  const execDir = path.dirname(process.execPath || "");
  const pghPath = path.join(execDir, "pgh");
  
  if (existsSync(pghPath)) {
    return pghPath;
  }
  
  // 尝试当前工作目录
  const cwdPgh = path.join(process.cwd(), "pgh");
  if (existsSync(cwdPgh)) {
    return cwdPgh;
  }
  
  return pghPath; // 返回默认路径，后续检查是否存在
}

/**
 * 检查 pgh 是否可用
 */
export function isPghAvailable(): boolean {
  const pghPath = getPghPath();
  return existsSync(pghPath);
}
