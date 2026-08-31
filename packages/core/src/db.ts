import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

let db: Database | null = null;
const LATEST_SCHEMA_VERSION = 1;

export function getDb(): Database {
  if (db) return db;

  const stateDir = process.env.BRIDGE_STATE_DIR?.trim() || path.join(os.homedir(), ".wah");
  mkdirSync(stateDir, { recursive: true });

  const dbPath = path.join(stateDir, "bridge.db");
  db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  applyMigrations(db);

  return db;
}

function applyMigrations(database: Database): void {
  const row = database.query("PRAGMA user_version").get() as { user_version: number };
  let version = row.user_version;
  if (version > LATEST_SCHEMA_VERSION) {
    throw new Error(`数据库版本 ${version} 高于当前支持版本 ${LATEST_SCHEMA_VERSION}`);
  }
  if (version < 1) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      acp_session_id TEXT,
      owned_by_bridge INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_agent ON sessions(user_id, agent_id);

    CREATE TABLE IF NOT EXISTS access_users (
      user_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'revoked')),
      first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_access_users_status ON access_users(status, updated_at);
      `);
      database.exec("PRAGMA user_version = 1");
      database.exec("COMMIT");
      version = 1;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}

export function getSchemaVersion(): number {
  return (getDb().query("PRAGMA user_version").get() as { user_version: number }).user_version;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
