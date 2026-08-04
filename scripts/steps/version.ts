import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { rootDir } from "../lib/env.ts";

/** 读取 package.json 版本号，生成 src/version.ts */
export function generateVersion(): void {
  const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf-8"));
  const content = `// 此文件由 scripts/build.ts 自动生成，请勿手动修改
export const VERSION = "${pkg.version}";
`;
  writeFileSync(path.join(rootDir, "src", "version.ts"), content);
  console.log(`Generated src/version.ts with version ${pkg.version}`);
}
