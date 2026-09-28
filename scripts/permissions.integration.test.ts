import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("permissions CLI defaults off and persists enable/disable without changing access", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "wah-permissions-"));
  const cli = path.resolve(import.meta.dir, "../src/cli/index.ts");
  const run = (action: string) => Bun.spawnSync([process.execPath, cli, "permissions", action], {
    cwd: dir, env: { ...process.env, BRIDGE_STATE_DIR: dir, WAH_DEV: "1" }, stdout: "pipe", stderr: "pipe",
  });
  const initial = run("status");
  expect(initial.exitCode).toBe(0);
  expect(initial.stdout.toString()).toContain("autoApprove=false");
  const configPath = path.join(dir, "bridge.config.json");
  expect(await Bun.file(configPath).exists()).toBe(false);
  await Bun.write(configPath, JSON.stringify({ allowFrom: ["owner"], webPort: 4321 }));
  expect(run("enable").exitCode).toBe(0);
  expect(await Bun.file(configPath).json()).toMatchObject({ autoApprove: true, allowFrom: ["owner"], webPort: 4321 });
  expect(run("status").stdout.toString()).toContain("autoApprove=true");
  expect(run("disable").exitCode).toBe(0);
  expect(await Bun.file(configPath).json()).toMatchObject({ autoApprove: false, allowFrom: ["owner"], webPort: 4321 });
  const before = await Bun.file(configPath).text();
  expect(run("invalid").exitCode).not.toBe(0);
  expect(await Bun.file(configPath).text()).toBe(before);
});
