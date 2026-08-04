import path from "path";

export const rootDir = path.resolve(import.meta.dir, "../..");
export const distDir = path.join(rootDir, "dist");
export const pghDir = path.join(rootDir, "tool", "pgh");

/** Windows 下为可执行文件名补 .exe 后缀 */
export function exeName(name: string): string {
  return process.platform === "win32" ? `${name}.exe` : name;
}
