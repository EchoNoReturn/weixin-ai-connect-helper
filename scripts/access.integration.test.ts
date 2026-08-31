import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const rootDir = path.resolve(import.meta.dir, "..");
const stateDir = mkdtempSync(path.join(tmpdir(), "wah-access-test-"));
const userId = "integration-user@im.wechat";

afterAll(() => {
  rmSync(stateDir, { recursive: true, force: true });
});

function runAccess(...args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync(
    [process.execPath, "run", "src/cli/index.ts", "access", ...args],
    {
      cwd: rootDir,
      env: { ...process.env, BRIDGE_STATE_DIR: stateDir },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

describe("access CLI with real SQLite", () => {
  it("persists approve and revoke decisions across processes", () => {
    const approved = runAccess("approve", userId);
    expect(approved.exitCode).toBe(0);

    const approvedList = runAccess("list", "approved");
    expect(approvedList.exitCode).toBe(0);
    expect(approvedList.stdout).toContain(userId);

    const revoked = runAccess("revoke", userId);
    expect(revoked.exitCode).toBe(0);

    const revokedList = runAccess("list", "revoked");
    expect(revokedList.exitCode).toBe(0);
    expect(revokedList.stdout).toContain(userId);
  });
});
