import path from "path";
import { existsSync } from "fs";
import { isDevMode } from "./cli/runtime.ts";
import { STATE_DIR } from "./env.ts";

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
  const cwdPath = path.resolve(filename);
  const statePath = path.join(STATE_DIR, filename);

  // 源码开发优先使用仓库当前目录，避免读取已安装版本的配置。
  if (isDevMode()) {
    if (existsSync(cwdPath)) return cwdPath;
    if (existsSync(statePath)) return statePath;
    return cwdPath;
  }

  // 安装版配置与运行状态放在 STATE_DIR；手动解压运行时兼容二进制同目录。
  const binPath = path.join(getBinDir(), filename);
  if (existsSync(statePath)) return statePath;
  if (existsSync(binPath)) return binPath;
  if (existsSync(cwdPath)) return cwdPath;
  return statePath;
}
