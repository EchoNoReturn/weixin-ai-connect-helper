import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDb, getDb, getSchemaVersion } from "../db.ts";

let stateDir: string | undefined;
afterEach(() => {
  closeDb();
  if (stateDir) rmSync(stateDir, { recursive: true, force: true });
  stateDir = undefined;
  delete process.env.BRIDGE_STATE_DIR;
});

describe("database migrations", () => {
  test("initializes the latest schema transactionally", () => {
    stateDir = mkdtempSync(path.join(tmpdir(), "wah-db-test-"));
    process.env.BRIDGE_STATE_DIR = stateDir;
    const db = getDb();
    expect(getSchemaVersion()).toBe(1);
    const tables = db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
    expect(tables.map((row) => row.name)).toContain("access_users");
  });
});
