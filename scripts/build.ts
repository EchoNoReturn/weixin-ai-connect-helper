/**
 * 构建入口
 *   bun run scripts/build.ts           全量构建（version → pgh → web → cli）
 *   bun run scripts/build.ts version   仅生成 src/version.ts
 *   bun run scripts/build.ts pgh       仅编译 pgh（Go）并同步到 dist/
 *   bun run scripts/build.ts web       仅构建 Web 控制台并同步到 dist/app/web/dist
 *   bun run scripts/build.ts cli       仅编译 wah
 */
import { buildCli } from "./steps/cli.ts";
import { buildPgh } from "./steps/pgh.ts";
import { generateVersion } from "./steps/version.ts";
import { buildWeb } from "./steps/web.ts";

const step = process.argv[2] ?? "all";

switch (step) {
  case "version":
    generateVersion();
    break;
  case "pgh":
    buildPgh();
    break;
  case "web":
    buildWeb();
    break;
  case "cli":
    buildCli();
    break;
  case "all":
    generateVersion();
    buildPgh({ optional: true });
    buildWeb();
    buildCli();
    console.log("Build complete!");
    break;
  default:
    console.error(`未知步骤: ${step}（可选: all | version | pgh | web | cli）`);
    process.exit(1);
}
