import path from "path";
import { existsSync } from "fs";
import { isDevMode } from "./cli/runtime.ts";

/**
 * 获取当前可执行文件所在目录
 * 开发阶段：源码目录
 * 生产阶段：二进制文件所在目录
 */
export function getBinDir(): string {
  // 开发阶段：运行的是 .ts 文件
  if (isDevMode()) {
    return __dirname;
  }
  
  // 生产阶段：使用 process.execPath 获取二进制文件路径
  if (process.execPath) {
    const execDir = path.dirname(process.execPath);
    if (execDir && execDir !== "." && existsSync(execDir)) {
      return execDir;
    }
  }
  
  // 回退到当前工作目录
  return process.cwd();
}

/**
 * 获取配置文件路径（相对于二进制目录）
 */
export function getConfigPath(filename: string): string {
  const binDir = getBinDir();
  const configPath = path.join(binDir, filename);
  
  // 如果二进制目录下没有配置文件，尝试当前工作目录
  if (existsSync(configPath)) {
    return configPath;
  }
  
  // 回退到当前工作目录
  return filename;
}
