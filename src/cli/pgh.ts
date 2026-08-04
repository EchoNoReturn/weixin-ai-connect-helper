import { resolveTool } from "./runtime.ts";

/** 查找 pgh 可执行文件路径，找不到返回 null */
export function findPgh(): string | null {
  return resolveTool("pgh", {
    envVar: "WAH_PGH_PATH",
    devPath: "tool/pgh/dist/pgh",
  });
}

/** 检查 pgh 是否可用 */
export function isPghAvailable(): boolean {
  return findPgh() !== null;
}
