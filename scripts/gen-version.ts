import { readFileSync, writeFileSync } from "fs";
import path from "path";

const pkg = JSON.parse(readFileSync(path.join(import.meta.dir, "..", "package.json"), "utf-8"));
const version = pkg.version;

const content = `// 此文件由 scripts/gen-version.ts 自动生成，请勿手动修改
export const VERSION = "${version}";
`;

writeFileSync(path.join(import.meta.dir, "..", "src", "version.ts"), content);
console.log(`Generated src/version.ts with version ${version}`);
